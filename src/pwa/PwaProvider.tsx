import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CheckCircle, WifiOff, Wifi, RefreshCw } from 'lucide-react';

export function PwaProvider() {
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      if (wasOffline.current) {
        toast('Back online', {
          description: 'Your connection has been restored.',
          icon: <Wifi size={18} />,
          duration: 3000,
        });
      }
      wasOffline.current = false;
    };

    const handleOffline = () => {
      wasOffline.current = true;
      toast('No internet connection', {
        description: 'Some features may be unavailable.',
        icon: <WifiOff size={18} />,
        duration: 5000,
      });
    };

    const handleAppInstalled = () => {
      toast('Soundrift installed', {
        description: 'You can now launch it from your home screen.',
        icon: <CheckCircle size={18} />,
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('appinstalled', handleAppInstalled);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        toast('Updated', {
          description: 'App updated to the latest version.',
          icon: <RefreshCw size={18} />,
          duration: 3000,
        });
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null;
}
