/**
 * dirgha gpu — GPU compute subcommand
 *
 * Usage:
 *   dirgha gpu list                    List available GPU types + prices
 *   dirgha gpu status <instance-id>    Check running instance
 *   dirgha gpu destroy <instance-id>   Terminate instance
 *   dirgha gpu jobs                    Show GPU job history
 *   dirgha gpu budget [amount]         Show/set monthly budget
 *   dirgha gpu audit                   Show audit log
 *   dirgha gpu market list             Browse marketplace listings
 *   dirgha gpu market post <gpu> <price>  List GPU on marketplace
 */
import type { Subcommand } from "./index.js";
export declare const gpuSubcommand: Subcommand;
