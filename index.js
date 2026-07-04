
process.on('unhandledRejection', (reason, p) => {
    console.log("\n=== [MOHAMED DEBUG] Caught Unhandled Rejection ===");
    console.error(reason);
    if (reason && reason.stack) {
        console.error(reason.stack);
    }
});

process.on('uncaughtException', (err) => {
    console.log("\n=== [MOHAMED DEBUG] Caught Uncaught Exception ===");
    console.error(err);
    if (err && err.stack) {
        console.error(err.stack);
    }
});


const { bootstrap } = require("./src/config/bootstrap");
bootstrap();