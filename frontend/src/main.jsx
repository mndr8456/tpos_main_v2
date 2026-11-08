import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './style.css';
import EinvoiceRequestPublic from './EinvoiceRequestPublic.jsx';
const customerRequestPath=window.location.pathname.match(/^\/einvoice\/request\/(t[1-9][0-9]{0,14}\.[0-9a-f]{64})$/);
createRoot(document.getElementById('root')).render(<React.StrictMode>{customerRequestPath?<EinvoiceRequestPublic token={customerRequestPath[1]}/>:<App/>}</React.StrictMode>);
