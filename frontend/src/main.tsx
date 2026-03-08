import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App, { DiscoverPage, MarketDetailsPage, PositionsPage } from './App';
import WhitepaperPage from './WhitepaperPage';
import './index.css';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // App contains Web3Provider which wraps AppLayout
    children: [
      {
        path: "/",
        element: <DiscoverPage />
      },
      {
        path: "/market/:id",
        element: <MarketDetailsPage />
      },
      {
        path: "/positions",
        element: <PositionsPage />
      },
      {
        path: "/whitepaper",
        element: <WhitepaperPage />
      }
    ]
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
