/**
 * 转写服务缝（ADR-0004，唯一新增缝，仿 ScoringService 模式）：
 * 输入已落盘的上传视频，异步产出句子清单（文本 + 起止毫秒）。
 * 节奏对齐讯飞录音文件转写（LFASR）：submit 拿任务引用即返回，
 * poll 按引用查询进行中/失败/完成——调用方（草稿服务）只依赖本接口，
 * 假实现用于测试与无凭据环境，讯飞适配器由 06 号票补上。
 */

/** 转写产出的一句：文本 + 起止时间（毫秒，讯飞 bg/ed 同口径） */
export interface TranscribedSentence {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptionSubmitInput {
  /** 已落盘的视频路径（uploads 根下的相对路径） */
  videoPath: string;
}

/** submit 的返回：任务引用，须可持久化（草稿行存 transcribe_task_id） */
export interface TranscriptionTask {
  taskId: string;
}

/**
 * poll 的返回（判别联合）：
 * - pending：转写进行中，稍后按同一 taskId 再 poll（生产侧退避轮询）
 * - failed：转写失败但可重试——草稿保持 transcribing，错误信息落库
 * - done：拿到句子清单，草稿置 proofreading
 */
export type TranscriptionPollResult =
  | { state: "pending" }
  | { state: "failed"; error: string }
  | { state: "done"; sentences: TranscribedSentence[] };

export interface TranscriptionService {
  submit(input: TranscriptionSubmitInput): Promise<TranscriptionTask>;
  poll(taskId: string): Promise<TranscriptionPollResult>;
}
