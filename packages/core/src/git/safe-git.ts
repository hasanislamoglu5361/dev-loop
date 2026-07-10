export interface SimpleGitLike {
  status(): Promise<{ files: Array<{ path: string }> }>;
  diff(args?: string[]): Promise<string>;
  checkoutLocalBranch(name: string): Promise<void>;
  add(files: string[]): Promise<void>;
  commit(message: string): Promise<{ commit: string }>;
  raw(args: string[]): Promise<unknown>;
}

export interface SafeGitOptions {
  git: SimpleGitLike;
}

export interface SafeGitCommitOptions {
  message: string;
  files: string[];
}

export interface SafeGitCommitResult {
  commit: string;
  files: string[];
}

export interface SafeGitRollbackOptions {
  ref: string;
  allowDestructive?: boolean;
}

export interface SafeGitRollbackResult {
  rolledBack: boolean;
  ref?: string;
  reason?: string;
}

const RUNTIME_FILE_PATTERNS = [
  /^\.dev-loop\//,
  /dev-loop\.db$/,
  /notification_log/i,
];

export class SafeGit {
  private readonly git: SimpleGitLike;

  constructor(options: SafeGitOptions) {
    this.git = options.git;
  }

  async status(): Promise<{ files: Array<{ path: string }> }> {
    return this.git.status();
  }

  async diff(): Promise<string> {
    return this.git.diff();
  }

  async createBranch(name: string): Promise<void> {
    const status = await this.status();
    if (status.files.length > 0) {
      throw new Error('Working tree is dirty; refusing to create branch.');
    }

    await this.git.checkoutLocalBranch(name);
  }

  async commit(options: SafeGitCommitOptions): Promise<SafeGitCommitResult> {
    const files = options.files.filter(file => !isRuntimeFile(file)).sort();
    if (files.length === 0) {
      throw new Error('No committable files after filtering runtime files.');
    }

    await this.git.add(files);
    const result = await this.git.commit(options.message);

    return {
      commit: result.commit,
      files,
    };
  }

  async rollback(options: SafeGitRollbackOptions): Promise<SafeGitRollbackResult> {
    if (!options.allowDestructive) {
      return {
        rolledBack: false,
        reason: 'Destructive rollback disabled.',
      };
    }

    await this.git.raw(['reset', '--hard', options.ref]);

    return {
      rolledBack: true,
      ref: options.ref,
    };
  }

  async updateChangelog(): Promise<{ updated: false; reason: string }> {
    return {
      updated: false,
      reason: 'Changelog hook is not configured yet.',
    };
  }
}

function isRuntimeFile(file: string): boolean {
  return RUNTIME_FILE_PATTERNS.some(pattern => pattern.test(file));
}
