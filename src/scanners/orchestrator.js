export async function runScanners(input, scanners = []) {
  const results = await Promise.all(scanners.map(async (scanner, index) => {
    try {
      return (await scanner(input)) ?? [];
    } catch (error) {
      return [unavailableFinding(index, error)];
    }
  }));
  return results.flat();
}

function unavailableFinding(index, error) {
  return {
    id: `scanner-${index + 1}-unavailable`,
    category: 'capability',
    title: 'Scanner unavailable',
    detail: error instanceof Error ? error.message : 'This scanner could not run in this browser.',
    severity: 'low',
    confidence: 1,
    recommendation: 'Use a browser that supports this local scanner or continue with the available checks.',
    assessment: 'unavailable',
    resolved: false,
  };
}
