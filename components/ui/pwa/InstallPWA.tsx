"use client";


import { useRef, useState, useEffect } from "react";
import Icon from "@/components/ui/core/Icon";
import { PUSH_ONBOARDING_KEYS } from "@/lib/push-client";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

type InstallPWAProps = {
  label?: string;
  className?: string;
  hintClassName?: string;
};

export default function InstallPWA({
  label = "Install App",
  className,
  hintClassName,
}: InstallPWAProps) {
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Detect if already installed/standalone
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as NavigatorWithStandalone).standalone === true;
    
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as BeforeInstallPromptEvent;
    };

    const handleAppInstalled = () => {
      window.localStorage.setItem(PUSH_ONBOARDING_KEYS.installedAt, new Date().toISOString());
      installPromptRef.current = null;
      setShowIOSHint(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const installPromptEvent = installPromptRef.current;
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === 'accepted') {
        installPromptRef.current = null;
      }
    } else {
      setShowIOSHint(true);
    }
  };

  if (isStandalone) return null;

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleInstallClick}
        aria-label={label}
        className={
          className ||
          "inline-flex h-10 items-center gap-2 rounded-lg border border-divider bg-paper px-3.5 text-sm font-semibold text-text-body transition-colors hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
        }
      >
        <Icon name="download" className="text-[15px]" />
        {label}
      </button>

      {showIOSHint && (
        <div className={hintClassName || "absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 shadow-lg z-50"}>
          <button type="button" onClick={() => setShowIOSHint(false)}
            aria-label="Close install instructions"
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
                To install this app, click the install icon (monitor with a down arrow) in the right side of your browser&apos;s address bar.
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
