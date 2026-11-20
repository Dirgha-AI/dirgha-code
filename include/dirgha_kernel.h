/*
 * Dirgha v2 Sovereign Agent Kernel — C-ABI Header (`include/dirgha_kernel.h`)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Provides zero-copy C-ABI bindings for C/C++, Python (`ctypes` / `PyO3`), and Node.js (`N-API` / `ffi-rs`)
 * to invoke `lokahi-gate` (`wasm32-wasip1` & native `cdylib`).
 */

#ifndef DIRGHA_KERNEL_H
#define DIRGHA_KERNEL_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Execute the 50-scenario `Lokahi-50` adversarial red-team suite inside `lokahi-gate`.
 * Returns `50` when all 50 normative software, network, and Physical AI rules pass.
 */
int32_t lokahi_wasm_run_red_team_50(void);

/**
 * Evaluate a UTF-8 command or tool payload buffer `(ptr, len)` against the 18 Lokahi
 * safety rules (shell flag permutation tokenizer, base64 pipe decoder, cloud metadata SSRF,
 * path traversal, Shannon entropy secret check, and Rule 14/18 S2 hardware gating) in `<1 ms`.
 *
 * @param ptr            Pointer to UTF-8 payload bytes.
 * @param len            Byte length of `ptr`.
 * @param is_s2_critical Non-zero if the action is classified as `S2HardwareOrCritical`.
 * @return `1` if `Allow`, `0` if `Deny`, `-1` if `ptr` is null or invalid UTF-8.
 */
int32_t lokahi_c_abi_evaluate_utf8(const uint8_t *ptr, size_t len, int32_t is_s2_critical);

#ifdef __cplusplus
}
#endif

#endif /* DIRGHA_KERNEL_H */
