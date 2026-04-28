/**
 * Sandbox adapter contract. The command-execution layer calls exec()
 * and receives stdout/stderr/exit-code. Adapters decide how to contain
 * the child process: macOS Seatbelt, Linux Landlock/bwrap, Windows
 * JobObject, or a noop pass-through when no platform support exists.
 */
export {};
//# sourceMappingURL=iface.js.map