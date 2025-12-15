"""
ZeroMQ server for X-Plorer backend.
Handles requests from Electron frontend and publishes file system events.
"""

import asyncio
import sys
import signal
import logging
from typing import Callable, Any

import zmq
import zmq.asyncio
import msgpack

# Fix for Windows: ZeroMQ needs SelectorEventLoop, not ProactorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from .protocol import XPRequest, XPResponse, XPError, XPEvent, ErrorCode, ACTIONS
from .services.file_service import FileService
from .services.watch_service import WatchService
from .services.theme_service import ThemeService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEALER_ENDPOINT = "tcp://127.0.0.1:5555"
PUB_ENDPOINT = "tcp://127.0.0.1:5556"


class XPServer:
    """Main server class for X-Plorer backend."""

    def __init__(self):
        self.context = zmq.asyncio.Context()
        self.router: zmq.asyncio.Socket | None = None
        self.publisher: zmq.asyncio.Socket | None = None
        self.running = False

        # Cancellation token registry: {operation_id: asyncio.Event}
        self._cancellation_tokens: dict[str, asyncio.Event] = {}

        # Services
        self.file_service = FileService()
        self.watch_service = WatchService(self._publish_event)
        self.theme_service = ThemeService()

    def _create_cancellation_token(self, operation_id: str) -> asyncio.Event:
        """Create a cancellation token for an operation."""
        token = asyncio.Event()
        self._cancellation_tokens[operation_id] = token
        return token

    def _cancel_operation(self, operation_id: str) -> bool:
        """Cancel an operation by ID."""
        token = self._cancellation_tokens.pop(operation_id, None)
        if token:
            token.set()  # Signal cancellation
            logger.debug(f"Cancelled operation: {operation_id}")
            return True
        return False

    def _cleanup_token(self, operation_id: str):
        """Remove token after operation completes."""
        self._cancellation_tokens.pop(operation_id, None)

    async def start(self):
        """Start the server."""
        logger.info("Starting X-Plorer backend server...")

        # Create ROUTER socket for request/response
        self.router = self.context.socket(zmq.ROUTER)
        self.router.bind(DEALER_ENDPOINT)
        logger.info(f"ROUTER socket bound to {DEALER_ENDPOINT}")

        # Create PUB socket for events
        self.publisher = self.context.socket(zmq.PUB)
        self.publisher.bind(PUB_ENDPOINT)
        logger.info(f"PUB socket bound to {PUB_ENDPOINT}")

        # Start watch service
        await self.watch_service.start()

        self.running = True
        logger.info("Server started successfully")

        # Main receive loop
        await self._receive_loop()

    async def stop(self):
        """Stop the server."""
        logger.info("Stopping server...")
        self.running = False

        await self.watch_service.stop()

        if self.router:
            self.router.close()
        if self.publisher:
            self.publisher.close()

        self.context.term()
        logger.info("Server stopped")

    async def _receive_loop(self):
        """Main loop for receiving and processing requests."""
        while self.running:
            try:
                # Wait for message with timeout to allow checking running flag
                if await self.router.poll(timeout=100):
                    frames = await self.router.recv_multipart()

                    if len(frames) >= 2:
                        identity = frames[0]
                        message = frames[-1]

                        # Process in background task
                        asyncio.create_task(
                            self._handle_request(identity, message)
                        )

            except zmq.ZMQError as e:
                if self.running:
                    logger.error(f"ZMQ error: {e}")
            except Exception as e:
                logger.error(f"Error in receive loop: {e}")

    async def _handle_request(self, identity: bytes, message: bytes):
        """Handle a single request."""
        response: XPResponse

        try:
            # Decode request
            data = msgpack.unpackb(message, raw=False)
            request = XPRequest(
                id=data.get("id", ""),
                action=data.get("action", ""),
                params=data.get("params", {}),
            )

            logger.debug(f"Received request: {request.action}")

            # Route to handler
            response = await self._route_request(request)

        except msgpack.UnpackException as e:
            logger.error(f"Failed to decode request: {e}")
            response = XPResponse(
                id="",
                success=False,
                error=XPError(
                    code=ErrorCode.INVALID_REQUEST,
                    message="Failed to decode request",
                ),
            )
        except Exception as e:
            logger.error(f"Error handling request: {e}")
            response = XPResponse(
                id=data.get("id", "") if "data" in dir() else "",
                success=False,
                error=XPError(
                    code=ErrorCode.UNKNOWN,
                    message=str(e),
                ),
            )

        # Send response
        try:
            response_data = msgpack.packb(response.to_dict())
            await self.router.send_multipart([identity, response_data])
        except Exception as e:
            logger.error(f"Failed to send response: {e}")

    async def _route_request(self, request: XPRequest) -> XPResponse:
        """Route request to appropriate handler."""
        handler_name = ACTIONS.get(request.action)

        if not handler_name:
            return XPResponse(
                id=request.id,
                success=False,
                error=XPError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=f"Unknown action: {request.action}",
                ),
            )

        # Get handler method
        handler = getattr(self, handler_name, None)
        if not handler:
            return XPResponse(
                id=request.id,
                success=False,
                error=XPError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=f"Handler not implemented: {handler_name}",
                ),
            )

        try:
            result = await handler(request.params)
            return XPResponse(id=request.id, success=True, data=result)
        except FileNotFoundError as e:
            return XPResponse(
                id=request.id,
                success=False,
                error=XPError(code=ErrorCode.PATH_NOT_FOUND, message=str(e)),
            )
        except PermissionError as e:
            return XPResponse(
                id=request.id,
                success=False,
                error=XPError(code=ErrorCode.ACCESS_DENIED, message=str(e)),
            )
        except Exception as e:
            logger.error(f"Error in handler {handler_name}: {e}")
            return XPResponse(
                id=request.id,
                success=False,
                error=XPError(code=ErrorCode.UNKNOWN, message=str(e)),
            )

    async def _publish_event(self, event: XPEvent):
        """Publish an event to subscribers."""
        if self.publisher:
            try:
                topic = event.path.encode("utf-8")
                data = msgpack.packb(event.to_dict())
                await self.publisher.send_multipart([topic, data])
            except Exception as e:
                logger.error(f"Failed to publish event: {e}")

    # Operation Control Handler
    async def handle_cancel(self, params: dict) -> dict:
        """Handle operation cancellation request."""
        operation_id = params.get("operation_id")
        cancelled = self._cancel_operation(operation_id) if operation_id else False
        return {"cancelled": cancelled, "operation_id": operation_id}

    # File System Handlers
    async def handle_fs_list(self, params: dict) -> list[dict]:
        path = params.get("path", "")
        operation_id = params.get("operation_id")

        cancel_token = None
        if operation_id:
            cancel_token = self._create_cancellation_token(operation_id)

        try:
            return await self.file_service.list_directory(path, cancel_token)
        finally:
            if operation_id:
                self._cleanup_token(operation_id)

    async def handle_fs_info(self, params: dict) -> dict:
        return await self.file_service.get_file_info(params.get("path", ""))

    async def handle_fs_copy(self, params: dict) -> dict:
        return await self.file_service.copy_files(
            params.get("sources", []),
            params.get("destination", ""),
        )

    async def handle_fs_move(self, params: dict) -> dict:
        return await self.file_service.move_files(
            params.get("sources", []),
            params.get("destination", ""),
        )

    async def handle_fs_delete(self, params: dict) -> dict:
        return await self.file_service.delete_files(
            params.get("paths", []),
            params.get("recycleBin", True),
        )

    async def handle_fs_rename(self, params: dict) -> dict:
        return await self.file_service.rename_file(
            params.get("path", ""),
            params.get("newName", ""),
        )

    async def handle_fs_mkdir(self, params: dict) -> dict:
        return await self.file_service.create_directory(params.get("path", ""))

    async def handle_fs_write_file(self, params: dict) -> dict:
        return await self.file_service.write_file(
            params.get("path", ""),
            params.get("content", ""),
        )

    async def handle_fs_folder_stats(self, params: dict) -> dict:
        return await self.file_service.get_folder_stats(params.get("path", ""))

    async def handle_fs_folder_size(self, params: dict) -> dict:
        path = params.get("path", "")
        operation_id = params.get("operation_id")

        cancel_token = None
        if operation_id:
            cancel_token = self._create_cancellation_token(operation_id)

        try:
            return await self.file_service.get_folder_size(path, cancel_token)
        finally:
            if operation_id:
                self._cleanup_token(operation_id)

    async def handle_fs_drives(self, params: dict) -> list[dict]:
        return await self.file_service.get_drives()

    async def handle_fs_watch(self, params: dict) -> dict:
        path = params.get("path", "")
        await self.watch_service.watch(path)
        return {"watching": path}

    async def handle_fs_unwatch(self, params: dict) -> dict:
        path = params.get("path", "")
        await self.watch_service.unwatch(path)
        return {"unwatched": path}

    async def handle_fs_search(self, params: dict) -> list[dict]:
        path = params.get("path", "")
        query = params.get("query", "")
        recursive = params.get("recursive", True)
        operation_id = params.get("operation_id")

        cancel_token = None
        if operation_id:
            cancel_token = self._create_cancellation_token(operation_id)

        try:
            return await self.file_service.search(path, query, recursive, cancel_token)
        finally:
            if operation_id:
                self._cleanup_token(operation_id)

    # Clipboard Handlers
    async def handle_clipboard_copy(self, params: dict) -> dict:
        from .services.clipboard_service import ClipboardService
        return await ClipboardService.copy(
            params.get("paths", []),
            params.get("cut", False),
        )

    async def handle_clipboard_cut(self, params: dict) -> dict:
        from .services.clipboard_service import ClipboardService
        return await ClipboardService.copy(params.get("paths", []), cut=True)

    async def handle_clipboard_paste(self, params: dict) -> dict:
        from .services.clipboard_service import ClipboardService
        return await ClipboardService.paste(params.get("destination", ""))

    async def handle_clipboard_get(self, params: dict) -> list[str]:
        from .services.clipboard_service import ClipboardService
        return await ClipboardService.get_files()

    async def handle_clipboard_clear(self, params: dict) -> dict:
        from .services.clipboard_service import ClipboardService
        return await ClipboardService.clear()

    # Shell Handlers
    async def handle_shell_thumbnail(self, params: dict) -> str:
        from .services.shell_service import ShellService
        return await ShellService.get_thumbnail(
            params.get("path", ""),
            params.get("size", 96),
        )

    async def handle_shell_icon(self, params: dict) -> str:
        from .services.shell_service import ShellService
        return await ShellService.get_icon(
            params.get("path", ""),
            params.get("size", 16),
        )

    async def handle_shell_contextmenu(self, params: dict) -> list[dict]:
        from .services.shell_service import ShellService
        return await ShellService.get_context_menu(params.get("paths", []))

    async def handle_shell_execute(self, params: dict) -> dict:
        from .services.shell_service import ShellService
        return await ShellService.execute(
            params.get("path", ""),
            params.get("verb", "open"),
            params.get("args"),
            params.get("directory"),
        )

    async def handle_shell_properties(self, params: dict) -> dict:
        from .services.shell_service import ShellService
        return await ShellService.show_properties(params.get("path", ""))

    async def handle_shell_open(self, params: dict) -> dict:
        from .services.shell_service import ShellService
        return await ShellService.open_file(params.get("path", ""))

    async def handle_shell_recent(self, params: dict) -> list[dict]:
        from .services.shell_service import ShellService
        return await ShellService.get_recent_files(params.get("limit", 20))

    async def handle_shell_create_shortcut(self, params: dict) -> dict:
        from .services.shell_service import ShellService
        return await ShellService.create_shortcut(
            params.get("targetPath", ""),
            params.get("shortcutPath", ""),
        )

    async def handle_shell_known_folders(self, params: dict) -> dict:
        from .services.shell_service import ShellService
        return await ShellService.get_known_folder_paths()

    # Theme Handlers
    async def handle_theme_list(self, params: dict) -> list[dict]:
        return await self.theme_service.list_themes()

    async def handle_theme_get(self, params: dict) -> dict:
        return await self.theme_service.get_theme(params.get("id", ""))

    async def handle_theme_save(self, params: dict) -> dict:
        return await self.theme_service.save_theme(params.get("theme", {}))

    async def handle_theme_delete(self, params: dict) -> dict:
        return await self.theme_service.delete_theme(params.get("id", ""))

    # 7-Zip Handlers
    async def handle_sevenzip_check(self, params: dict) -> dict:
        from .services.sevenzip_service import SevenZipService
        return await SevenZipService.is_installed()

    async def handle_sevenzip_add(self, params: dict) -> dict:
        from .services.sevenzip_service import SevenZipService
        return await SevenZipService.add_to_archive(
            params.get("paths", []),
            params.get("archivePath", ""),
            params.get("format", "zip"),
        )

    async def handle_sevenzip_add_dialog(self, params: dict) -> dict:
        from .services.sevenzip_service import SevenZipService
        return await SevenZipService.show_add_to_archive_dialog(
            params.get("paths", []),
        )

    async def handle_sevenzip_open(self, params: dict) -> dict:
        from .services.sevenzip_service import SevenZipService
        return await SevenZipService.open_archive(params.get("path", ""))

    async def handle_sevenzip_extract(self, params: dict) -> dict:
        from .services.sevenzip_service import SevenZipService
        return await SevenZipService.extract_archive(
            params.get("archivePath", ""),
            params.get("destination"),
        )


async def main():
    """Main entry point."""
    server = XPServer()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    def signal_handler():
        asyncio.create_task(server.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: signal_handler())

    try:
        await server.start()
    except KeyboardInterrupt:
        pass
    finally:
        await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
