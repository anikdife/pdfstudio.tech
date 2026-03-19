import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import './styles/base.css';
import { useFirebaseUserStore } from './state/firebaseUserStore';

// Initialize Firebase auth as early as possible so redirect results are processed
// before any Drive/auth-dependent UI mounts.
void useFirebaseUserStore.getState().initFirebaseAuth();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
