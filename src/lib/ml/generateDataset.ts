
import fs from 'fs';

const reminder_templates = [
    "Remind me to {task} tomorrow",
    "Don't let me forget to {task}",
    "Set a reminder for {task}",
    "Please remind me about {task}",
    "Can you remind me to {task}?",
    "I need a reminder for {task}",
    "Remember to {task}",
    "Remind me next week to {task}",
    "Add reminder for {task}",
    "Schedule reminder to {task}"
];

const reminder_tasks = [
    "call mom", "submit assignment", "pay electricity bill", "attend meeting", "drink water",
    "go to gym", "buy groceries", "check emails", "finish project", "study for exams",
    "visit doctor", "renew subscription", "reply to client", "book tickets", "water plants"
];

const emotion_templates = [
    "I feel {emotion} today", "I'm feeling very {emotion}", "Today has been really {emotion}",
    "I am emotionally {emotion}", "Lately I've been feeling {emotion}", "I feel so {emotion} right now",
    "This week feels very {emotion}", "Everything seems {emotion}", "I'm mentally {emotion}", "I feel extremely {emotion}"
];

const emotions = [
    "sad", "stressed", "anxious", "happy", "lonely", "overwhelmed", "frustrated", "depressed",
    "excited", "nervous", "angry", "hopeless", "motivated", "tired", "confused"
];

const action_templates = [
    "Create a {item}", "Generate a {item}", "Send the {item}", "Prepare the {item}",
    "Make a {item}", "Build a {item}", "Write a {item}", "Design a {item}",
    "Complete the {item}", "Update the {item}"
];

const action_items = [
    "report", "presentation", "summary", "email", "dashboard", "proposal", "spreadsheet",
    "database", "website", "application", "API", "document", "invoice", "schedule", "analysis"
];

const smalltalk_phrases = [
    "How are you?", "What's up?", "Good morning", "Tell me a joke", "Hey there",
    "How's your day going?", "Nice weather today", "Good evening", "Long time no see",
    "What are you doing?", "Hello!", "How have you been?", "Good night",
    "Yo what's happening", "Hope you're doing well"
];

const unknown_phrases = [
    "asdfghjkl", "123456789", "???", "random text", "qwerty", "blah blah",
    "undefined input", "@@@@@@", "lorem ipsum", "nonsense words", "random string here",
    "xxxxxxxx", "invalid request", "test test test", "unrecognized data"
];

function randomChoice(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const rows: string[] = ["text,label"];

// Generate 200 rows per class
for (let i = 0; i < 200; i++) {
    const text = randomChoice(reminder_templates).replace("{task}", randomChoice(reminder_tasks));
    rows.push(`"${text}",reminder`);
}
for (let i = 0; i < 200; i++) {
    const text = randomChoice(emotion_templates).replace("{emotion}", randomChoice(emotions));
    rows.push(`"${text}",emotional-support`);
}
for (let i = 0; i < 200; i++) {
    const text = randomChoice(action_templates).replace("{item}", randomChoice(action_items));
    rows.push(`"${text}",action-item`);
}
for (let i = 0; i < 200; i++) {
    const text = randomChoice(smalltalk_phrases);
    rows.push(`"${text}",small-talk`);
}
for (let i = 0; i < 200; i++) {
    const text = randomChoice(unknown_phrases);
    rows.push(`"${text}",unknown`);
}

fs.writeFileSync('./data/intent_dataset_large.csv', rows.join('\n'));
console.log("Large dataset generated: ./data/intent_dataset_large.csv");
