export declare function raceSignals(...signals: AbortSignal[]): {
    signal: AbortSignal;
    cancel: () => void;
};
