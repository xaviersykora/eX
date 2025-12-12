import React from 'react';
import ReactDOM from 'react-dom/client';
import { TabBar } from './components/tabs/TabBar';
import { StateProvider } from './contexts/StateProvider';
import './styles/index.css';

// This is a separate entry point for the tab bar window.
// It renders only the TabBar component.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StateProvider>
      <TabBar />
    </StateProvider>
  </React.StrictMode>
);