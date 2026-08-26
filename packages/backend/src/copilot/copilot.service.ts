/**
 * Copilot service — AI-powered task assistance using OpenAI/GPT.
 * Provides task description generation, status recommendations,
 * task breakdown suggestions, and content enhancement.
 *
 * Falls back to rule-based responses when OPENAI_API_KEY is not set
 * (useful for development/demo purposes).
 */
import { Injectable, Logger } from '@nestjs/common';

interface SuggestionRequest {
  prompt: string;
  context?: {
    taskTitle?: string;
    taskDescription?: string;
    projectName?: string;
    status?: string;
    priority?: string;
  };
}

export interface SuggestionResponse {
  suggestion: string;
  model: string;
  provider: 'openai' | 'rule-based';
}

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly enabled: boolean;
  private readonly model: string;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['OPENAI_API_KEY'] || '';
    this.model = process.env['OPENAI_MODEL'] || 'gpt-4o-mini';
    this.enabled = !!this.apiKey;
    if (this.enabled) {
      this.logger.log(`AI Copilot enabled (model: ${this.model})`);
    } else {
      this.logger.warn('OPENAI_API_KEY not set — Copilot will use rule-based fallback');
    }
  }

  /**
   * Get a suggestion from the AI copilot.
   */
  async getSuggestion(request: SuggestionRequest): Promise<SuggestionResponse> {
    if (this.enabled) {
      try {
        return await this.queryOpenAI(request);
      } catch (err) {
        this.logger.warn(`OpenAI query failed, falling back: ${(err as Error).message}`);
        return this.ruleBasedSuggestion(request);
      }
    }
    return this.ruleBasedSuggestion(request);
  }

  /**
   * Query OpenAI GPT for a suggestion.
   */
  private async queryOpenAI(request: SuggestionRequest): Promise<SuggestionResponse> {
    const systemPrompt = `You are an AI project management assistant for OpenWork Hub.
You help users write better task descriptions, set appropriate priorities, break down complex tasks, 
and get status recommendations.

Keep responses concise (2-3 sentences max), practical, and actionable. 
Use a professional but friendly tone.`;

    const userPrompt = this.buildPrompt(request);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const suggestion = data.choices?.[0]?.message?.content || 'No suggestion available.';

    return {
      suggestion: suggestion.trim(),
      model: this.model,
      provider: 'openai',
    };
  }

  /**
   * Build a prompt based on the request type.
   */
  private buildPrompt(request: SuggestionRequest): string {
    const { prompt, context } = request;
    const ctx = context || {};

    const parts: string[] = [];

    if (ctx.taskTitle) parts.push(`Task: "${ctx.taskTitle}"`);
    if (ctx.taskDescription) parts.push(`Description: "${ctx.taskDescription}"`);
    if (ctx.projectName) parts.push(`Project: "${ctx.projectName}"`);
    if (ctx.status) parts.push(`Status: ${ctx.status}`);
    if (ctx.priority) parts.push(`Priority: ${ctx.priority}`);

    const contextStr = parts.length > 0 ? `\nContext:\n${parts.join('\n')}\n\n` : '\n';

    return `${contextStr}User request: ${prompt}`;
  }

  /**
   * Rule-based fallback when OpenAI is not configured.
   */
  private ruleBasedSuggestion(request: SuggestionRequest): SuggestionResponse {
    const { prompt, context } = request;
    const lower = prompt.toLowerCase();

    let suggestion = '';

    if (lower.includes('description') || lower.includes('describe') || lower.includes('write')) {
      if (context?.taskTitle) {
        suggestion =
          `For the task "${context.taskTitle}", a good description should include:\n` +
          `1. **Goal**: What needs to be accomplished\n` +
          `2. **Acceptance Criteria**: Specific requirements for completion\n` +
          `3. **Scope**: What's included (and what's not)\n` +
          `4. **Dependencies**: Any blockers or prerequisites\n\n` +
          `Example: "Implement ${context.taskTitle} by adding the necessary backend endpoints and frontend components. ` +
          `Acceptance: API returns correct data, UI shows loading/error/empty states, tests pass."`;
      } else {
        suggestion =
          'To write an effective task description: start with the goal, add acceptance criteria, list dependencies, and define the scope of work. Keep it clear and actionable.';
      }
    } else if (
      lower.includes('priority') ||
      lower.includes('urgent') ||
      lower.includes('important')
    ) {
      suggestion =
        'Priority recommendations:\n' +
        '- **Urgent**: Critical path blockers, security issues, or client-facing deadlines\n' +
        '- **High**: Important features with approaching due dates\n' +
        '- **Medium**: Standard feature work, improvements\n' +
        '- **Low**: Nice-to-haves, technical debt, minor bugs';
    } else if (
      lower.includes('breakdown') ||
      lower.includes('subtask') ||
      lower.includes('split')
    ) {
      suggestion =
        'To break down this task:\n' +
        '1. Identify the core components or steps required\n' +
        '2. Separate backend and frontend work\n' +
        '3. Split by milestone or deliverable\n' +
        '4. Each subtask should be independently completable in 1-3 days';
    } else if (lower.includes('status') || lower.includes('progress')) {
      suggestion =
        'Status recommendations:\n' +
        '- **Backlog**: Ideas and future work not yet ready to start\n' +
        '- **To Do**: Ready and prioritized, just not started\n' +
        '- **In Progress**: Currently being worked on\n' +
        '- **In Review**: Ready for peer review or QA\n' +
        '- **Done**: Completed and verified';
    } else if (lower.includes('estimate') || lower.includes('time') || lower.includes('hour')) {
      suggestion =
        'For estimating effort:\n' +
        '- Small tasks (1-4 hours): Simple changes, documentation, bug fixes\n' +
        '- Medium tasks (1-3 days): New features, UI components\n' +
        '- Large tasks (1-2 weeks): Major features, integrations\n' +
        '- Epic (2+ weeks): Break these down into smaller tasks';
    } else {
      suggestion =
        `I can help with:\n` +
        `- Writing task descriptions\n` +
        `- Recommending priority levels\n` +
        `- Breaking down complex tasks into subtasks\n` +
        `- Suggesting appropriate statuses\n` +
        `- Estimating effort hours\n\n` +
        `Try asking something like "Write a description for 'Implement login'" or "What priority should a security fix be?"`;
    }

    return {
      suggestion,
      model: 'rule-based',
      provider: 'rule-based',
    };
  }
}
