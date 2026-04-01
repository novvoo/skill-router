export interface ProgressEvent {
  id: string
  stage: string
  message: string
  timestamp: number
  data?: any
}

export class ProgressTracker {
  private events: ProgressEvent[] = []
  private listeners: ((event: ProgressEvent) => void)[] = []
  private maxEvents = 1000

  track(id: string, stage: string, message: string, data?: any): void {
    const event: ProgressEvent = {
      id,
      stage,
      message,
      timestamp: Date.now(),
      data,
    }

    this.events.push(event)

    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Progress listener error:', error)
      }
    })
  }

  onProgress(listener: (event: ProgressEvent) => void): () => void {
    this.listeners.push(listener)

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  getEvents(id?: string): ProgressEvent[] {
    if (id) {
      return this.events.filter(event => event.id === id)
    }
    return [...this.events]
  }

  getLatestEvent(id: string): ProgressEvent | undefined {
    const events = this.getEvents(id)
    return events[events.length - 1]
  }

  clear(id?: string): void {
    if (id) {
      this.events = this.events.filter(event => event.id !== id)
    } else {
      this.events = []
    }
  }

  getProgress(id: string): {
    current: string
    history: ProgressEvent[]
    isComplete: boolean
  } {
    const events = this.getEvents(id)
    const latest = events[events.length - 1]
    
    return {
      current: latest?.message || 'No progress',
      history: events,
      isComplete: latest?.stage === 'completed' || latest?.stage === 'error'
    }
  }
}