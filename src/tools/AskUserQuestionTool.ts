import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'

const inputSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  options: z.array(z.string()).optional().describe('Optional multiple choice options'),
  timeout_seconds: z.number().int().min(1).max(300).default(60).describe('Timeout in seconds'),
})

const outputSchema = z.object({
  question: z.string().describe('The question that was asked'),
  answer: z.string().describe('The user\'s answer'),
  selected_option: z.string().optional().describe('Selected option if multiple choice'),
  response_time_seconds: z.number().describe('Time taken for user to respond'),
  timed_out: z.boolean().describe('Whether the question timed out'),
})

export type AskUserQuestionInput = z.infer<typeof inputSchema>
export type AskUserQuestionOutput = z.infer<typeof outputSchema>

// Mock implementation - in a real system, this would integrate with the UI
async function askUserQuestion(
  question: string,
  options?: string[],
  _timeoutSeconds: number = 60
): Promise<{
  answer: string
  selectedOption?: string
  responseTimeSeconds: number
  timedOut: boolean
}> {
  const startTime = Date.now()
  
  // In a real implementation, this would:
  // 1. Display the question in the UI
  // 2. Wait for user input
  // 3. Return the response
  
  // For now, we'll simulate a user response
  await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate thinking time
  
  const responseTimeSeconds = (Date.now() - startTime) / 1000
  
  if (options && options.length > 0) {
    // Multiple choice - select first option as mock response
    return {
      answer: options[0],
      selectedOption: options[0],
      responseTimeSeconds,
      timedOut: false,
    }
  } else {
    // Free text - provide a mock response
    return {
      answer: `This is a mock response to: "${question}". In a real implementation, this would be the user's actual input.`,
      responseTimeSeconds,
      timedOut: false,
    }
  }
}

export const AskUserQuestionTool = buildTool({
  name: 'ask_user_question',
  searchHint: 'ask the user a question and wait for their response',
  maxResultSizeChars: 10_000,
  
  async description(input) {
    return `Ask user: ${input.question}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return false // User interaction is not safe for concurrent execution
  },
  
  isReadOnly() {
    return true // Asking questions doesn't modify anything
  },
  
  userFacingName() {
    return 'Ask User Question'
  },
  
  getToolUseSummary(input) {
    if (!input?.question) return null
    return input.question.length > 50 
      ? input.question.substring(0, 47) + '...'
      : input.question
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Asking: ${summary}` : 'Asking user question'
  },
  
  async checkPermissions(input) {
    return {
      behavior: 'allow',
      updatedInput: input,
    }
  },
  
  async validateInput(input) {
    const { question, timeout_seconds, options } = input
    
    if (!question.trim()) {
      return {
        result: false,
        message: 'Question cannot be empty',
        errorCode: 1,
      }
    }
    
    if (timeout_seconds && (timeout_seconds < 1 || timeout_seconds > 300)) {
      return {
        result: false,
        message: 'timeout_seconds must be between 1 and 300',
        errorCode: 2,
      }
    }
    
    if (options && options.length > 20) {
      return {
        result: false,
        message: 'Maximum 20 options allowed',
        errorCode: 3,
      }
    }
    
    return { result: true }
  },
  
  async call({ question, options, timeout_seconds }, _context, onProgress) {
    onProgress?.({
      toolUseID: 'ask-user',
      data: {
        type: 'question_asked',
        question,
        options,
      },
    })
    
    try {
      const result = await askUserQuestion(question, options, timeout_seconds)
      
      onProgress?.({
        toolUseID: 'ask-user',
        data: {
          type: 'answer_received',
          answer: result.answer,
          response_time: result.responseTimeSeconds,
          timed_out: result.timedOut,
        },
      })
      
      const output: AskUserQuestionOutput = {
        question,
        answer: result.answer,
        selected_option: result.selectedOption,
        response_time_seconds: result.responseTimeSeconds,
        timed_out: result.timedOut,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: AskUserQuestionOutput = {
        question,
        answer: '',
        response_time_seconds: 0,
        timed_out: true,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, AskUserQuestionOutput>)