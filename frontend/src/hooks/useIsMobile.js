import { useEffect, useState } from 'react';

// Below this width the workspace switches from a fixed three-column
// layout (activity rail + sidebar + editor, side by side) to a
// single-column layout where the sidebar and terminal become slide-out
// drawers instead of permanently occupying screen space.
export const MOBILE_BREAKPOINT = 768;

const getIsMobile = () =>
    typeof window !== 'undefined' &&
    window.innerWidth <= MOBILE_BREAKPOINT;

/**
 * Tracks whether the viewport is currently "mobile" width. Re-evaluates
 * on resize and on orientation change, since rotating a phone/tablet can
 * cross the breakpoint in either direction without a resize event firing
 * on some browsers.
 */
export const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(getIsMobile);

    useEffect(() => {
        const update = () => setIsMobile(getIsMobile());

        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);

        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
        };
    }, []);

    return isMobile;
};

export default useIsMobile;
