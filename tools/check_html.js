const {
    validateWebAssets,
    printValidationResult,
} = require("./validate_web_assets");

const result = validateWebAssets();
printValidationResult(result);
process.exit(result.ok ? 0 : 1);
