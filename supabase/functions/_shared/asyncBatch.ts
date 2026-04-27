export interface MapWithConcurrencyOptions {
  delayMsBetweenBatches?: number;
}

function validateConcurrency(concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(
      `mapWithConcurrency concurrency must be a positive integer. Received: ${concurrency}`,
    );
  }
}

function normalizeDelayMs(value: number | undefined): number {
  if (value == null) {
    return 0;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `mapWithConcurrency delayMsBetweenBatches must be a finite non-negative number. Received: ${value}`,
    );
  }

  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  worker: (input: TInput, index: number) => Promise<TOutput>,
  options: MapWithConcurrencyOptions = {},
): Promise<TOutput[]> {
  if (inputs.length === 0) {
    return [];
  }

  validateConcurrency(concurrency);
  const delayMsBetweenBatches = normalizeDelayMs(
    options.delayMsBetweenBatches,
  );
  const results: TOutput[] = [];

  for (let start = 0; start < inputs.length; start += concurrency) {
    const chunk = inputs.slice(start, start + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((input, offset) => worker(input, start + offset)),
    );
    results.push(...chunkResults);

    const hasNextBatch = start + concurrency < inputs.length;
    if (hasNextBatch && delayMsBetweenBatches > 0) {
      await sleep(delayMsBetweenBatches);
    }
  }

  return results;
}
