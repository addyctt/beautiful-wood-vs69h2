import React from "react";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";

export default function LandingPage({ onLogin }) {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="landing-page">
      <h1>Welcome to Omegle Clone</h1>
      <p>
        Connect instantly with strangers around the world through text or video
        chat!
      </p>
      <button onClick={handleLogin} className="btn login-btn">
        Login with Google
      </button>
    </div>
  );
}
