
import React from 'react';

export default function Spinner(): React.ReactNode {
    return (
        <div
            className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"
            role="status"
            aria-label="loading"
        ></div>
    );
}
