import React, { createContext, useContext, useState, useCallback } from 'react';

const TourContext = createContext(null);

const STORAGE_KEYS = {
    lab1: 'lab1_tour_seen',
    lab2: 'lab2_tour_seen',
};

export function TourProvider({ children }) {
    const [runTour, setRunTour] = useState(false);
    const [currentLabTour, setCurrentLabTour] = useState(null);

    const hasSeenTour = useCallback((labId) => {
        const key = STORAGE_KEYS[labId];
        if (!key) return true;
        return localStorage.getItem(key) === 'true';
    }, []);

    const markTourSeen = useCallback((labId) => {
        const key = STORAGE_KEYS[labId];
        if (key) {
            localStorage.setItem(key, 'true');
        }
    }, []);

    const startTour = useCallback((labId) => {
        setCurrentLabTour(labId);
        setRunTour(true);
    }, []);

    const endTour = useCallback(() => {
        if (currentLabTour) {
            markTourSeen(currentLabTour);
        }
        setRunTour(false);
        setCurrentLabTour(null);
    }, [currentLabTour, markTourSeen]);

    const resetTour = useCallback((labId) => {
        const key = STORAGE_KEYS[labId];
        if (key) {
            localStorage.removeItem(key);
        }
    }, []);

    const value = {
        runTour,
        currentLabTour,
        hasSeenTour,
        markTourSeen,
        startTour,
        endTour,
        resetTour,
    };

    return (
        <TourContext.Provider value={value}>
            {children}
        </TourContext.Provider>
    );
}

export function useTour() {
    const context = useContext(TourContext);
    if (!context) {
        throw new Error('useTour must be used within a TourProvider');
    }
    return context;
}

export default TourContext;
