
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export async function saveSession(messages: any[], summary?: string, sessionId?: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `session-${timestamp}.md`;
  
  const userSessionsDir = sessionId ? join(process.cwd(), `user/${sessionId}/sessions`) : join(process.cwd(), "user/sessions");
  await mkdir(userSessionsDir, { recursive: true });
  
  const path = join(userSessionsDir, filename);
  
  const content = [
    `# Session ${timestamp}`,
    "",
    summary ? `## Summary\n${summary}\n` : "",
    "## Transcript",
    ...messages.map(m => `**${m.role}**: ${m.content}\n`)
  ].join("\n");
  
  await writeFile(path, content, "utf-8");
  return path;
}
