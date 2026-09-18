import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    
    // 1. Explicit URL parameter override: ?mobile=true, ?mobile=1, ?view=mobile
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === 'true' || params.get('mobile') === '1' || params.get('view') === 'mobile') {
      return true;
    }

    // 2. Physical screen dimension check for phones (regardless of iframe resolution/scale)
    const minDim = Math.min(window.screen.width, window.screen.height);
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobileUA && minDim <= 768) {
      return true;
    }

    // 3. Fallback to viewport width
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mobile') === 'true' || params.get('mobile') === '1' || params.get('view') === 'mobile') {
        setIsMobile(true);
        return;
      }

      const minDim = Math.min(window.screen.width, window.screen.height);
      const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobileUA && minDim <= 768) {
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
