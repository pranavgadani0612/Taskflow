import React, { useState, useEffect } from "react";
import "./PWAInstallPrompt.css";

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    localStorage.removeItem("taskflow_pwa_dismissed");

    // 1. Check if already installed / running as standalone PWA
    const isAppStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      document.referrer.includes("android-app://");

    if (isAppStandalone) {
      setIsStandalone(true);
      return;
    }

    // 2. Check if iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 3. Listen for Android / Chrome / Edge native beforeinstallprompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Auto-display banner after 1.5s so it reliably appears for testing and users
    const timer = setTimeout(() => {
      // Check session dismissal
      const dismissed = sessionStorage.getItem("taskflow_pwa_dismissed");
      if (!dismissed) {
        setShowBanner(true);
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      // Show iOS step-by-step instructions
      setShowIOSModal(true);
      setShowBanner(false);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Guide for desktop Chrome/Edge where beforeinstallprompt was already handled or deferred
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSModal(false);
    sessionStorage.setItem("taskflow_pwa_dismissed", "true");
  };

  if (isStandalone) return null;

  return (
    <>
      {/* 1. Floating Install Banner (Matching Image 1) */}
      {showBanner && !showIOSModal && (
        <div className="pwa-install-banner animate-slide-up" role="alert">
          <div className="pwa-banner-left">
            <div className="pwa-app-icon-wrapper">
              <img
                src="/padhya-logo.webp"
                alt="Padhya Technologies"
                className="pwa-app-logo"
                onError={(e) => {
                  e.target.src = "/padhya-favicon.svg";
                }}
              />
            </div>
            <div className="pwa-banner-text">
              <div className="pwa-app-title">Padhya Software Portal</div>
              <div className="pwa-app-subtitle">Install for quick &amp; 1-click access</div>
            </div>
          </div>

          <div className="pwa-banner-right">
            <button
              type="button"
              className="pwa-install-btn"
              onClick={handleInstallClick}
              aria-label="Install App"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Install</span>
            </button>

            <button
              type="button"
              className="pwa-close-btn"
              onClick={handleDismiss}
              aria-label="Dismiss banner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 2. iOS Safari Add to Home Screen Instructions Modal (Matching Image 2) */}
      {showIOSModal && (
        <div className="pwa-ios-modal-overlay animate-fade-in" onClick={handleDismiss}>
          <div className="pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <div className="pwa-ios-title-row">
                <div className="pwa-app-icon-wrapper-modal">
                  <img src="/padhya-logo.webp" alt="Padhya Software" className="pwa-app-logo" />
                </div>
                <div>
                  <h3 className="pwa-ios-title">Install Padhya Software</h3>
                  <p className="pwa-ios-subtitle">Add to your Home Screen</p>
                </div>
              </div>
              <button
                type="button"
                className="pwa-ios-close-btn"
                onClick={handleDismiss}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="pwa-ios-steps">
              <div className="pwa-ios-step">
                <div className="pwa-step-num">1</div>
                <div className="pwa-step-content">
                  Tap the <span className="highlight">Share</span> button{" "}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', margin: '0 2px' }}>
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>{" "}
                  in Safari
                </div>
              </div>

              <div className="pwa-ios-step">
                <div className="pwa-step-num">2</div>
                <div className="pwa-step-content">
                  Scroll down &amp; select <span className="highlight">Add to Home Screen</span>{" "}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', margin: '0 2px' }}>
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
              </div>

              <div className="pwa-ios-step">
                <div className="pwa-step-num">3</div>
                <div className="pwa-step-content">
                  Tap top-right <span className="highlight">Add</span> to finish!
                </div>
              </div>
            </div>

            <div className="pwa-ios-pointer">
              <span className="pwa-pointer-text">Tap the share icon below</span>
              <div className="pwa-bouncing-arrow">↓</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
