# eX

A minimal, open-source, and modern file explorer for Windows. Built with Electron, React, and Python.

## Features

*   **Modern UI:** A clean and customizable interface with minimalist, and glass/transparent style options.
*   **Tabbed Browsing:** Manage multiple folders in a single window with tabs.
*   **File & Folder Operations:** Full support for creating, reading, updating, and deleting files and folders.
*   **Native Integration:** Access to native shell context menus, thumbnails, and file properties.
*   **7-Zip Integration:** Easily create and extract archives.
*   **Customization:** Customize file and folder icons, colors, and more.
*   **Real-time Updates:** File system changes are reflected in real-time.
*   **System Tray Support:** Minimize to system tray and optionally start on Windows login for quick access.

## Tech Stack

*   **Frontend:** React with TypeScript
*   **Backend:** Python (with ZeroMQ for communication)
*   **Framework:** Electron
*   **Bundler:** Vite
*   **Styling:** CSS with variables for theming

## Getting Started

### Prerequisites

*   Node.js (v18 or later)
*   Python (v3.10 or later)
*   Git

### Development

To run the application in development mode:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/xaviersykora/eX.git
    cd eX
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

3.  **Install backend dependencies:**
    ```bash
    cd backend
    pip install -r requirements.txt
    cd ..
    ```

4.  **Run the development server:**
    This command will start both the Python backend and the Electron frontend with hot-reloading.
    ```bash
    npm run dev
    ```

### Building the Application

To build the application for production:

1.  **Ensure all dependencies are installed** by following the steps above.

2.  **Run the build script:**
    This script bundles the frontend, compiles the backend, and packages them into a distributable installer.
    ```bash
    npm run build
    ```

    The output will be located in the `release/` directory.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.



> **Note on naming:** This project was originally named "XPlorer" but has been renamed to "eX" to avoid confusion with other projects which share that name.