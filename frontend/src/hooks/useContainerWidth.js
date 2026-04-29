import { useState, useEffect } from 'react';

//Custom hook that tracks the width of a container element using ResizeObserver.

function useContainerWidth(ref, initialWidth = 500) {
    const [width, setWidth] = useState(initialWidth);

    useEffect(() => {
        if (!ref.current) return;

        const ro = new ResizeObserver((entries) => {
            // Use the first entry's contentRect width
            const newWidth = entries[0]?.contentRect?.width;
            if (newWidth != null && newWidth > 0) {
                setWidth(newWidth);
            }
        });

        ro.observe(ref.current);

        return () => ro.disconnect();
    }, [ref]);

    return width;
}

export default useContainerWidth;
