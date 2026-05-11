import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { TourProvider } from './context/TourContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TourProvider>
      <App />
    </TourProvider>
  </React.StrictMode>
);


