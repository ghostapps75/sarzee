const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Env Loading Logic
const envLocalPath = path.resolve(process.cwd(), '.env.local');

console.log(`Checking for .env.local at: ${envLocalPath}`);

if (fs.existsSync(envLocalPath)) {
    console.log(`Found .env.local, loading...`);
    dotenv.config({ path: envLocalPath });
} else {
    console.log("No .env.local found. Checking standard .env...");
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}

console.log("MESHY_API_KEY Status: " + (process.env.MESHY_API_KEY ? "LOADED" : "MISSING"));

const API_KEY = process.env.MESHY_API_KEY;

if (!API_KEY) {
    console.error("\nCRITICAL: MESHY_API_KEY not found in .env.local or environment variables.\n");
    process.exit(1);
}

const API_URL = "https://api.meshy.ai/v1/text-to-3d";
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'die-model.glb');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateDice() {
    console.log("🎲 Starting Dice Generation via Meshy.AI (JS Mode)...");

    const payload = {
        mode: "preview",
        prompt: "a masterwork 6-sided die, smooth white ivory plastic, deep black indented pips, rounded corners, photorealistic, 4k texture",
        art_style: "REALISTIC",
        negative_prompt: "low quality, text, numbers, distorted, flat, fuzzy"
    };

    try {
        // 1. Submit Generation Request
        console.log("Step 1: Authenticating and Sending request...");
        const createRes = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`Failed to create task: ${createRes.status} ${createRes.statusText} - ${errText}`);
        }

        const createData = await createRes.json();
        const taskId = createData.result;

        if (!taskId) {
            console.error("Unexpected response:", createData);
            throw new Error("No task ID returned");
        }

        console.log(`Task created! ID: ${taskId}`);

        // 2. Poll for Completion
        let status = "PENDING";
        let modelUrl = "";

        console.log("Step 2: Polling for completion...");
        while (status !== "SUCCEEDED" && status !== "FAILED") {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s

            const statusRes = await fetch(`${API_URL}/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (!statusRes.ok) {
                throw new Error(`Failed to check status: ${statusRes.status}`);
            }

            const statusData = await statusRes.json();
            status = statusData.status;
            const progress = statusData.progress || 0;
            process.stdout.write(`\rStatus: ${status} (${progress}%)   `);

            if (status === "SUCCEEDED") {
                modelUrl = statusData.model_urls.glb;
                process.stdout.write("\n");
            } else if (status === "FAILED") {
                process.stdout.write("\n");
                throw new Error(`Generation failed: ${statusData.task_error?.message || "Unknown error"}`);
            }
        }

        if (!modelUrl) {
            throw new Error("Task succeeded but no GLB URL found.");
        }

        console.log(`Generation Complete! Downloading model from: ${modelUrl}`);

        // 3. Download and Save
        console.log("Step 3: Downloading GLB file...");
        const downloadRes = await fetch(modelUrl);
        if (!downloadRes.ok) throw new Error(`Failed to download model: ${downloadRes.status}`);

        const buffer = await downloadRes.arrayBuffer();
        fs.writeFileSync(OUTPUT_FILE, Buffer.from(buffer));

        console.log(`✅ Model saved to: ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("\n❌ Error during generation process:", error);
        process.exit(1);
    }
}

generateDice();
