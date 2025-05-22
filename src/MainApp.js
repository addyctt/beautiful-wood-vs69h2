// MainApp.js
import React, { useState, useEffect } from "react";
import { auth, provider, signInWithPopup, signOut } from "./firebaseConfig";
import LoginPage from "./LoginPage";
import App from "./App"; // your existing app code here

export default function MainApp() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  async function handleLogin() {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Pass logout to your App if you want to show a logout button inside your app UI
  return <App user={user} onLogout={handleLogout} />;
}
