import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    
    // 1. Explicit URL parameter override: ?mobile=true, ?mobile=1, ?view=mobile
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === 'true' || params.get('mobile') === '1' || params.get('view') === 'mobile') {
      return true;
    }

    // 2. Physical screen dimension check for phones and small tablets
    const screenW = window.screen ? window.screen.width : window.innerWidth;
    const screenH = window.screen ? window.screen.height : window.innerHeight;
    const minDim = Math.min(screenW, screenH);
    
    // Check mobile user agents
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
    
    // Check Apple devices requesting desktop site (Macintosh UA with touch points)
    const isAppleMobile = /Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

    if ((isMobileUA || isAppleMobile) && minDim <= 820) {
      return true;
    }

    // 3. Physical screen width <= 500 is unconditionally a phone
    if (minDim <= 500) {
      return true;
    }

    // 4. Fallback to viewport width
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mobile') === 'true' || params.get('mobile') === '1' || params.get('view') === 'mobile') {
        setIsMobile(true);
        return;
      }

      const screenW = window.screen ? window.screen.width : window.innerWidth;
      const screenH = window.screen ? window.screen.height : window.innerHeight;
      const minDim = Math.min(screenW, screenH);
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
      const isAppleMobile = /Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

      if ((isMobileUA || isAppleMobile) && minDim <= 820) {
        setIsMobile(true);
        return;
      }

      if (minDim <= 500) {
        setIsMobile(true);
        return;
      }

      setIsMobile(window.innerWidth < 768);
    };

    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return isMobile;
}
