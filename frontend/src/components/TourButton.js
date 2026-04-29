import React from 'react';
import { useTour } from '../context/TourContext';

const TourButton = ({ currentLab }) => {
    const { startTour } = useTour();

    const handleClick = () => {
        startTour(currentLab);
    };

    return (
        <button
            onClick={handleClick}
            className="tour-btn"
            title="Start guided tour of this lab"
        >
            Start Tour
        </button>
    );
};

export default TourButton;