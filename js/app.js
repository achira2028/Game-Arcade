import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9NErfSi6GW9hKPTh2kU24UtNx-od727s",
  authDomain: "xo-online-51245.firebaseapp.com",
  databaseURL: "https://xo-online-51245-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xo-online-51245",
  storageBucket: "xo-online-51245.firebasestorage.app",
  messagingSenderId: "551577417167",
  appId: "1:551577417167:web:a43ff609d9bfd07aeeceba",
  measurementId: "G-DWVQ7PMVN1"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const App = (() => {
  const HUMAN_PLAYER = 'X';
  const AI_PLAYER = 'O';
  const AI_THINK_DELAY_MS = 500;
  const SCORES_STORAGE_KEY = 'tic-tac-toe-scores';
  const SKIN_STORAGE_KEY = 'tic-tac-toe-skin';
  const NICKNAME_STORAGE_KEY = 'tic-tac-toe-nickname';
  const BEST_STREAK_STORAGE_KEY = 'tic-tac-toe-best-streak';

  const SKINS = [
    { id: 'classic', x: 'X', o: 'O' },
    { id: 'shapes', x: '✕', o: '○' },
    { id: 'lines', x: '＋', o: '◇' },
    { id: 'arrows', x: '▲', o: '▼' }
  ];

  const COLOR_THAI = {
    cyan: 'ฟ้า (Cyan)',
    pink: 'ชมพู (Pink)',
    violet: 'ม่วง (Violet)',
    amber: 'ส้ม (Amber)'
  };

  const SVG_VOL_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  const SVG_VOL_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points
