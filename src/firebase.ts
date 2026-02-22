import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCZLm1ImWPTctkDRygAI19mpFOpoXg2QKg",
  authDomain: "taybah-9daad.firebaseapp.com",
  projectId: "taybah-9daad",
  storageBucket: "taybah-9daad.firebasestorage.app",
  messagingSenderId: "105253956939",
  appId: "1:105253956939:web:8bd26f7c8e6d3211c14cce"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const salesCollection = collection(db, "sales");
