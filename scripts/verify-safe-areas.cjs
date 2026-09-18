#!/usr/bin/env node

/**
 * Safe Area CSS Verification Script
 * 
 * This script verifies that the CSS changes are correctly implemented
 * by checking the CSS file for expected patterns and rules.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const cssFilePath = path.join(rootDir, 'packages/app/src/index.css');

function runChecks(content, checks, label) {
  let passed = 0;
  let failed = 0;

  checks.forEach(check => {
    if (check.pattern.test(content)) { // nosemgrep: nodejs_scan.javascript-dos-rule-regex_dos -- pattern is a hardcoded regex defined in the checks array, not user input
      console.log(`PASS: ${check.name}`);
      passed++;
    } else {
      console.log(`FAIL: ${check.name}`);
      failed++;
    }
  });

  console.log(`\n${label}: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

function verifySafeAreaImplementation() {
  console.log('VERIFYING SAFE AREA IMPLEMENTATION\n');

  if (!fs.existsSync(cssFilePath)) { // nosemgrep: eslint.detect-non-literal-fs-filename -- path built from __dirname and hardcoded literal, no user input
    console.error('CSS file not found:', cssFilePath);
    return false;
  }

  let cssContent;
  try {
    cssContent = fs.readFileSync(cssFilePath, 'utf8'); // nosemgrep: eslint.detect-non-literal-fs-filename -- path built from __dirname and hardcoded literal, no user input
  } catch (error) {
    console.error('Failed to read CSS file:', error.message);
    return false;
  }

  // Check for critical CSS rules
  const checks = [
    {
      name: 'Enhanced sidebar scrolling support',
      pattern: /\.sidebar-container\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/,
      required: true
    },
    {
      name: 'Hardware acceleration for smooth scrolling',
      pattern: /\.sidebar-container\s*\{[^}]*transform:\s*translateZ\(0\)/,
      required: true
    },
    {
      name: 'iOS-specific safe area handling',
      pattern: /@supports\s*\(-webkit-touch-callout:\s*none\)\s*\{[^}]*\.sidebar-container/,
      required: true
    },
    {
      name: 'iOS 18+ scroll bug prevention',
      pattern: /will-change:\s*transform/,
      required: true
    },
    {
      name: 'iOS sidebar bleeding fix with background-clip',
      pattern: /background-clip:\s*padding-box/,
      required: true
    },
    {
      name: 'Sidebar container overflow hidden',
      pattern: /\.sidebar-container\s*\{[^}]*overflow:\s*hidden/,
      required: true
    },
    {
      name: 'Sidebar content scrollable wrapper',
      pattern: /\.sidebar-content\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/,
      required: true
    },
    {
      name: 'Android 16+ fallback for broken safe area',
      pattern: /--pwa-safe-bottom:\s*max\(env\(safe-area-inset-bottom\),\s*32px\)/,
      required: true
    },
    {
      name: 'Android 16+ standalone mode detection',
      pattern: /@media\s*\(display-mode:\s*standalone\)/,
      required: true
    },
    {
      name: 'iOS bottom safe area removed',
      pattern: /\.ios-bottom-safe-area\s*\{[^}]*padding-bottom:\s*0px/,
      required: true
    },
    {
      name: 'Android-only bottom safe area',
      pattern: /@supports\s*not\s*\(-webkit-touch-callout:\s*none\)\s*\{[^}]*\.ios-bottom-safe-area[^}]*padding-bottom:\s*var\(--safe-area-bottom\)/,
      required: true
    },
    {
      name: 'Overscroll behavior containment',
      pattern: /overscroll-behavior:\s*contain/,
      required: true
    },
    {
      name: 'iOS 18+ root container scroll fix',
      pattern: /#root\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/,
      required: true
    },
    {
      name: 'Proper z-index stacking',
      pattern: /z-index:\s*30/,
      required: true
    }
  ];

  const checksPassed = runChecks(cssContent, checks, 'RESULTS');

  if (checksPassed) {
    console.log('\nALL SAFE AREA IMPLEMENTATIONS VERIFIED!');
    console.log('\nIMPLEMENTED FEATURES:');
    console.log('  • iOS status bar overlay prevention');
    console.log('  • iOS sidebar bleeding fixes with background-clip');
    console.log('  • iOS 18+ scroll bug prevention');
    console.log('  • Android 16+ edge-to-edge support via Capawesome plugin');
    console.log('  • Android 16+ safe area fallback with 32px minimum');
    console.log('  • Sidebar scrolling fixes for older devices');
    console.log('  • Hardware acceleration for smooth scrolling');
    console.log('  • Device-specific fallbacks');
    console.log('  • Overscroll behavior containment');
    return true;
  } else {
    console.log('\nWARNING: SOME IMPLEMENTATIONS ARE MISSING');
    return false;
  }
}

function verifyCapacitorConfig() {
  console.log('\nVERIFYING CAPACITOR CONFIGURATION\n');

  const configPath = path.join(rootDir, 'capacitor.config.ts');

  if (!fs.existsSync(configPath)) { // nosemgrep: eslint.detect-non-literal-fs-filename -- configPath is built from __dirname and a hardcoded literal, no user input involved
    console.error('Capacitor config not found:', configPath);
    return false;
  }

  let configContent;
  try {
    configContent = fs.readFileSync(configPath, 'utf8'); // nosemgrep: eslint.detect-non-literal-fs-filename -- path built from __dirname and hardcoded literal, no user input
  } catch (error) {
    console.error('Failed to read capacitor config:', error.message);
    return false;
  }

  const checks = [
    {
      name: 'StatusBar overlaysWebView disabled for iOS',
      pattern: /overlaysWebView:\s*false/
    },
    {
      name: 'StatusBar style configured',
      pattern: /style:\s*"LIGHT"/
    },
    {
      name: 'EdgeToEdge plugin configured for Android 16+',
      pattern: /EdgeToEdge:\s*\{[^}]*backgroundColor:\s*"#3A464F"/
    },
    {
      name: 'SystemBars insets handling disabled',
      pattern: /insetsHandling:\s*"disable"/
    }
  ];

  return runChecks(configContent, checks, 'CAPACITOR CONFIG');
}

function verifyAndroidStyles() {
  console.log('\nVERIFYING ANDROID STYLES\n');

  const stylesPath = path.join(rootDir, 'android/app/src/main/res/values/styles.xml');

  if (!fs.existsSync(stylesPath)) { // nosemgrep: eslint.detect-non-literal-fs-filename -- path built from __dirname and hardcoded literal, no user input
    console.error('Android styles not found:', stylesPath);
    return false;
  }

  let stylesContent;
  try {
    stylesContent = fs.readFileSync(stylesPath, 'utf8'); // nosemgrep: eslint.detect-non-literal-fs-filename -- path built from __dirname and hardcoded literal, no user input
  } catch (error) {
    console.error('Failed to read Android styles:', error.message);
    return false;
  }

  const checks = [
    {
      name: 'Edge-to-edge opt-out',
      pattern: /android:windowOptOutEdgeToEdgeEnforcement.*true/
    }
  ];

  return runChecks(stylesContent, checks, 'ANDROID STYLES');
}

// Run all verifications
function runAllVerifications() {
  console.log('SAFE AREA FUNCTIONALITY TESTING\n');

  const cssOk = verifySafeAreaImplementation();
  const capacitorOk = verifyCapacitorConfig();
  const androidOk = verifyAndroidStyles();

  console.log('\nOVERALL RESULT:');
  if (cssOk && capacitorOk && androidOk) {
    console.log('ALL VERIFICATIONS PASSED!');
    console.log('\nREADY FOR TESTING ON DEVICES:');
    console.log('  • iPhone 8/8+ (older device support)');
    console.log('  • iPhone X+ (notch/Dynamic Island)');
    console.log('  • iOS 18+ (scroll bug prevention)');
    console.log('  • Android 9-10 (legacy support)');
    console.log('  • Android 11-15 (edge-to-edge)');
    console.log('  • Android 16+ (forced edge-to-edge with plugin)');
    console.log('\nTEST SCENARIOS:');
    console.log('  1. iOS status bar overlay prevention');
    console.log('  2. iOS sidebar bleeding into status bar');
    console.log('  3. iOS 18+ scroll bug with fixed elements');
    console.log('  4. Android 16+ navigation bar overlap');
    console.log('  5. Safe area insets in landscape mode');
    console.log('  6. Sidebar scrolling on older devices');
    return true;
  } else {
    console.log('SOME VERIFICATIONS FAILED');
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  const success = runAllVerifications();
  process.exit(success ? 0 : 1);
}

module.exports = { runAllVerifications };
