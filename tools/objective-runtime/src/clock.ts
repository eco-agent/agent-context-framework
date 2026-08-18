import { utcTimestamp, type UtcTimestamp } from "@agent-context/objective-kernel";

export interface ObjectiveClock {
  now(): UtcTimestamp;
}

export class SystemObjectiveClock implements ObjectiveClock {
  public now(): UtcTimestamp {
    return utcTimestamp(new Date().toISOString());
  }
}

export class ManualObjectiveClock implements ObjectiveClock {
  #current: UtcTimestamp;

  public constructor(initial: UtcTimestamp) {
    this.#current = initial;
  }

  public now(): UtcTimestamp {
    return this.#current;
  }

  public set(value: UtcTimestamp): void {
    this.#current = value;
  }

  public advance(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new TypeError("Clock advance must be a non-negative safe integer.");
    }
    this.#current = utcTimestamp(
      new Date(Date.parse(this.#current) + milliseconds).toISOString(),
    );
  }
}
