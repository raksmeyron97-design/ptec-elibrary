"use client";

import { useState, useEffect } from "react";
import Icon from "@/components/ui/core/Icon";

export default function InstallPWA() {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Detect if already installed/standalone
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === 'accepted') {
        setInstallPromptEvent(null);
      }
    } else {
      setShowIOSHint(true);
    }
  };

  if (isStandalone) return null;

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleInstallClick}
        aria-label="Install App"
        className="w-9 h-9 rounded-xl bg-bg-surface/5 border border-white/10 flex items-center justify-center hover:bg-brand hover:border-brand transition-all text-blue-100 hover:text-white"
      >
        <Icon name="download" className="text-[16px]" />
      </button>

      {showIOSHint && (
        <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 shadow-lg z-50">
          <button 
            onClick={() => setShowIOSHint(false)}
            className="absolute right-2 top-2 text-text-muted hover:text-text-heading"
          >
            <Icon name="x" className="text-lg" />
          </button>
          
          {isIOS ? (
            <>
              <p className="mb-2 text-sm font-semibold text-text-heading">Install on iOS</p>
              <p className="text-xs text-text-muted mb-2">
                To install this app on your device:
              </p>
              <ol className="list-decimal pl-4 text-xs text-text-body space-y-1">
                <li>Tap the <strong>Share</strong> button <Icon name="share" className="inline text-[12px] -mt-0.5" /> below</li>
                <li>Select <strong>Add to Home Screen</strong> <Icon name="plus-square" className="inline text-[12px] -mt-0.5" /></li>
              </ol>
              
              <div className="mt-3 pt-3 border-t border-divider">
                <p className="text-xs text-text-muted mb-2 font-khmer-serif">
                  ដើម្បីដំឡើងកម្មវិធីនៅលើឧបករណ៍របស់អ្នក៖
                </p>
                <ol className="list-decimal pl-4 text-xs text-text-body font-khmer-serif space-y-1">
                  <li>ចុចប៊ូតុង <strong>ចែករំលែក (Share)</strong> ខាងក្រោម</li>
                  <li>ជ្រើសរើស <strong>បន្ថែមទៅអេក្រង់ដើម (Add to Home Screen)</strong></li>
                </ol>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-text-heading">Install App</p>
              <p className="text-xs text-text-muted mb-2">
                To install this app, click the install icon (monitor with a down arrow) in the right side of your browser's address bar.
              </p>
              <div className="mt-3 pt-3 border-t border-divider">
                <p className="text-xs text-text-muted font-khmer-serif">
                  ដើម្បីដំឡើងកម្មវិធី សូមចុចរូបតំណាងទាញយកនៅក្នុងរបារអាសយដ្ឋាន (Address bar) ខាងលើ។
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
