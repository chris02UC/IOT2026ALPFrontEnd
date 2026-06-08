// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // We need this specific SDK for the Realtime DB

const firebaseConfig = {
  apiKey: "AIzaSyC-LhMRAQJq88FhUai68BfAkQ5s2CfDM24",
  authDomain: "iot-alp-46c09.firebaseapp.com",
  databaseURL: "https://iot-alp-46c09-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-alp-46c09",
  storageBucket: "iot-alp-46c09.firebasestorage.app",
  messagingSenderId: "657198718597",
  appId: "1:657198718597:web:b2d68da4c918da9c70d3ec"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and export it so App.jsx can listen to it
export const database = getDatabase(app);