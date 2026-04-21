import { createGuardRequestWithHooks } from "./guard"
import { MemoryRequestStore } from "./store/memory"
import type { CreateIdempoConfig } from "./types"

export function createIdempo(config?: CreateIdempoConfig) {
  const store = config?.store ?? new MemoryRequestStore()
  const hooks = config?.hooks

  return {
    guardRequest: createGuardRequestWithHooks(store, hooks),
  }
}
