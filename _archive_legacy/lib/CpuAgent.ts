import { SarzeeEngine } from "./SarzeeEngine";
import { ScoreCategory } from "./types";

export class CpuAgent {
    constructor(private engine: SarzeeEngine) { }

    public async takeTurn(onThinking: (msg: string) => void) {
        // Step 1: Initial Roll
        onThinking("Rolling...");
        await this.wait(1000);
        // We simulate a roll by interacting with the engine directly? 
        // Or do we need to trigger the physics engine?
        // Triggering physics is hard from here without a ref to the Arena.
        // Ideally, the CPU should just interact with the Engine state logic if we want "Simulation",
        // but to make it visible, we need to drive the UI?

        // Let's assume the Page handles the "Trigger Roll" action for the CPU.
        // This agent just decides WHAT to do.
    }

    // Simple decision making
    public decideHold(dice: number[], rollsLeft: number): boolean[] {
        // Simple heuristic: 
        // If we have 3/4/5 of a kind, hold them.
        // If we have a near straight, hold it.
        // For now: Just hold max occurring value.

        const counts = new Array(7).fill(0);
        dice.forEach(d => counts[d]++);

        let targetVal = 0;
        let maxCount = 0;

        // Find most frequent die
        for (let i = 1; i <= 6; i++) {
            if (counts[i] >= maxCount) {
                maxCount = counts[i];
                targetVal = i;
            }
        }

        // Hold all dice that match targetVal
        return dice.map(d => d === targetVal);
    }

    public decideCategory(scorecard: any, potentialScores: any): ScoreCategory | null {
        // Pick highest available score
        // Prioritize: Yahtzee > Large Straight > Small Straight > Full House > rest

        // This is a placeholder for the logic we will impl in page.tsx
        return null;
    }

    private wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
