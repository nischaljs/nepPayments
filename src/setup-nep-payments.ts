import fs from 'fs-extra';
import inquirer, { QuestionCollection } from 'inquirer';
import path from 'path';

// Define available payment gateways
const AVAILABLE_GATEWAYS = {
  KHALTI: 'Khalti',
  ESEWA: 'eSewa',
  FONEPAY: 'Fonepay'
} as const;

type GatewayName = (typeof AVAILABLE_GATEWAYS)[keyof typeof AVAILABLE_GATEWAYS];

// Step 1: Ask for environment
const environmentQuestion: QuestionCollection<{
  environment: 'sandbox' | 'production';
}> = {
  environment: {
    type: 'list',
    message: 'Which environment do you want to set up?',
    choices: [
      { name: 'Sandbox/Test Mode', value: 'sandbox' },
      { name: 'Production Mode', value: 'production' }
    ]
  }
};

// Step 2: Ask user to select gateways
const gatewaySelectionQuestion: QuestionCollection<{
  selectedGateways: GatewayName[];
}> = {
  selectedGateways: {
    // Now the key matches!
    type: 'checkbox',
    message: 'Select the payment gateways you want to integrate:',
    choices: Object.values(AVAILABLE_GATEWAYS),
    validate: (answer: string[]): boolean | string => {
      return answer.length >= 1 || 'You must choose at least one gateway.';
    }
  }
};

// Get default test credentials based on gateway
function getTestCredentials(gateway: GatewayName): Record<string, string> {
  switch (gateway) {
    case AVAILABLE_GATEWAYS.KHALTI:
      return {
        secretKey: 'test_secret_key_dc74e0fd57cb46cd93832aee0a507256',
        publicKey: 'test_public_key_dc74e0fd57cb46cd93832aee0a390775'
      };
    case AVAILABLE_GATEWAYS.ESEWA:
      return {
        merchantCode: 'EPAYTEST',
        merchantSecret: '8gBm/:&EnhH.1/q'
      };
    case AVAILABLE_GATEWAYS.FONEPAY:
      return {
        merchantId: 'TEST_MERCHANT',
        secretKey: 'test_secret_key'
      };
    default:
      return {};
  }
}

// Step 3: Ask for credentials based on selected gateways
async function askGatewayCredentials(
  gatewayName: GatewayName,
  isSandbox: boolean
): Promise<Record<string, string> | null> {
  const gatewayPrompts: any[] = [];
  const testCreds = getTestCredentials(gatewayName);

  console.log(`\nConfiguring ${gatewayName}:`);
  if (isSandbox) {
    console.log(
      'Using sandbox/test mode - you can use the default test credentials or enter your own.'
    );
  }

  switch (gatewayName) {
    case AVAILABLE_GATEWAYS.KHALTI:
      gatewayPrompts.push({
        type: 'password',
        name: 'khaltiSecretKey',
        message: `Enter Khalti Secret Key (${isSandbox ? 'Test' : 'Live'}):`,
        mask: '*',
        default: isSandbox ? testCreds.secretKey : undefined
      });
      gatewayPrompts.push({
        type: 'input',
        name: 'khaltiPublicKey',
        message: `Enter Khalti Public Key (${isSandbox ? 'Test' : 'Live'}):`,
        default: isSandbox ? testCreds.publicKey : undefined
      });
      break;

    case AVAILABLE_GATEWAYS.ESEWA:
      gatewayPrompts.push({
        type: 'input',
        name: 'esewaMerchantCode',
        message: `Enter eSewa Merchant Code (${isSandbox ? 'Test' : 'Live'}):`,
        default: isSandbox ? testCreds.merchantCode : undefined
      });
      gatewayPrompts.push({
        type: 'password',
        name: 'esewaMerchantSecret',
        message: `Enter eSewa Merchant Secret (${isSandbox ? 'Test' : 'Live'}):`,
        mask: '*',
        default: isSandbox ? testCreds.merchantSecret : undefined
      });
      break;

    case AVAILABLE_GATEWAYS.FONEPAY:
      gatewayPrompts.push({
        type: 'input',
        name: 'fonepayMerchantId',
        message: `Enter Fonepay Merchant ID (${isSandbox ? 'Test' : 'Live'}):`,
        default: isSandbox ? testCreds.merchantId : undefined
      });
      gatewayPrompts.push({
        type: 'password',
        name: 'fonepaySecretKey',
        message: `Enter Fonepay Secret Key (${isSandbox ? 'Test' : 'Live'}):`,
        mask: '*',
        default: isSandbox ? testCreds.secretKey : undefined
      });
      break;
  }

  if (gatewayPrompts.length > 0) {
    return await inquirer.prompt(gatewayPrompts);
  }
  return null;
}

// Step 4: Write environment variables to `.env`
async function runSetup(): Promise<void> {
  console.log('Setting up nepPayments...');

  try {
    // First ask for environment
    const envAnswer = await inquirer.prompt<{
      environment: 'sandbox' | 'production';
    }>(environmentQuestion);
    const isSandbox = envAnswer.environment === 'sandbox';

    // Then ask for gateways
    const answers = await inquirer.prompt<{
      selectedGateways: GatewayName[];
    }>(gatewaySelectionQuestion);
    const { selectedGateways } = answers;

    let envContent = `NODE_ENV=${isSandbox ? 'development' : 'production'}\n\n`;

    for (const gateway of selectedGateways) {
      const credentials = await askGatewayCredentials(gateway, isSandbox);

      if (!credentials) continue;

      const prefix = gateway.toUpperCase().replace(/\s+/g, '_');

      for (const [key, value] of Object.entries(credentials)) {
        if (value && value.trim()) {
          envContent += `${prefix}_${key.toUpperCase()}="${value.trim()}"\n`;
        }
      }

      envContent += '\n';
    }

    const envPath = path.join(process.cwd(), '.env');

    // Append or create .env file
    await fs.writeFile(envPath, envContent.trim());
    console.log(`\nEnvironment variables saved to .env`);

    // Suggest adding .env to .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const gitignoreExists = await fs.pathExists(gitignorePath);
    if (!gitignoreExists) {
      await fs.writeFile(gitignorePath, '.env\n');
    } else {
      const content = await fs.readFile(gitignorePath, 'utf8');
      if (!content.includes('.env')) {
        await fs.appendFile(gitignorePath, '\n.env\n');
      }
    }

    console.log('\n✅ Setup complete!');
    console.log(`👉 Running in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);
    console.log('👉 Add `.env` to your .gitignore to avoid exposing secrets.');
    console.log('👉 Access credentials via process.env in your app.');
  } catch (error) {
    console.error('Error during setup:', error instanceof Error ? error.message : String(error));
  }
}

runSetup();
