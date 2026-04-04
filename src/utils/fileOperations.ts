import { join, normalize, resolve, dirname, basename, extname } from 'path'
import { 
  readFile, writeFile, stat, access, mkdir, rename, unlink, copyFile, 
  constants, open, readdir 
} from 'fs/promises'
import { existsSync, mkdirSync, writeFileSync, closeSync, openSync } from 'fs'
import { SecurityManager, securityManager } from './security.js'
import { logger } from './logger.js'

export interface FileOperationOptions {
  securityManager?: SecurityManager
  createBackup?: boolean
  backupDir?: string
  enableLocking?: boolean
  lockTimeoutMs?: number
  encoding?: BufferEncoding
}

const DEFAULT_OPTIONS: FileOperationOptions = {
  securityManager,
  createBackup: true,
  backupDir: '.backups',
  enableLocking: true,
  lockTimeoutMs: 30000,
  encoding: 'utf8'
}

export interface FileInfo {
  path: string
  name: string
  size: number
  isDirectory: boolean
  isFile: boolean
  mtime: Date
  extname: string
}

export class FileOperationsManager {
  private options: FileOperationOptions
  private activeLocks: Map<string, { timestamp: number; owner: string }> = new Map()

  constructor(options: Partial<FileOperationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.ensureBackupDirExists()
  }

  private ensureBackupDirExists(): void {
    if (this.options.createBackup && this.options.backupDir) {
      try {
        if (!existsSync(this.options.backupDir)) {
          mkdirSync(this.options.backupDir, { recursive: true })
        }
      } catch (error) {
        logger.warn(`Failed to create backup directory: ${error}`)
      }
    }
  }

  private validatePath(filePath: string): { valid: true; normalizedPath: string } | { valid: false; error: string } {
    const security = this.options.securityManager || securityManager
    return security.validatePath(filePath)
  }

  private getBackupPath(filePath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = basename(filePath)
    const ext = extname(filePath)
    const baseNameWithoutExt = fileName.slice(0, -ext.length) || fileName
    const backupFileName = `${baseNameWithoutExt}.${timestamp}${ext}.bak`
    return join(this.options.backupDir || '.backups', backupFileName)
  }

  private async createBackup(filePath: string): Promise<string | null> {
    if (!this.options.createBackup) {
      return null
    }

    try {
      const stats = await stat(filePath)
      if (!stats.isFile()) {
        return null
      }

      const backupPath = this.getBackupPath(filePath)
      await copyFile(filePath, backupPath)
      logger.info(`Created backup: ${filePath} -> ${backupPath}`)
      return backupPath
    } catch (error) {
      logger.warn(`Failed to create backup for ${filePath}: ${error}`)
      return null
    }
  }

  private getLockFilePath(filePath: string): string {
    return `${filePath}.lock`
  }

  async acquireLock(filePath: string, owner: string = 'default'): Promise<boolean> {
    if (!this.options.enableLocking) {
      return true
    }

    const lockPath = this.getLockFilePath(filePath)
    const timeout = this.options.lockTimeoutMs || 30000
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const handle = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY)
        writeFileSync(handle, JSON.stringify({ owner, timestamp: Date.now() }))
        closeSync(handle)
        this.activeLocks.set(filePath, { timestamp: Date.now(), owner })
        logger.debug(`Acquired lock for ${filePath} by ${owner}`)
        return true
      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    logger.error(`Failed to acquire lock for ${filePath} after ${timeout}ms`)
    return false
  }

  async releaseLock(filePath: string): Promise<void> {
    if (!this.options.enableLocking) {
      return
    }

    const lockPath = this.getLockFilePath(filePath)
    try {
      await unlink(lockPath)
      this.activeLocks.delete(filePath)
      logger.debug(`Released lock for ${filePath}`)
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Failed to release lock for ${filePath}: ${error}`)
      }
    }
  }

  async isLocked(filePath: string): Promise<boolean> {
    if (!this.options.enableLocking) {
      return false
    }
    return existsSync(this.getLockFilePath(filePath))
  }

  async safeWriteFile(filePath: string, content: string | Buffer, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    const mergedOptions = { ...this.options, ...options }
    const validation = this.validatePath(filePath)
    
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const lockOwner = `write-${Date.now()}`
    let backupPath: string | null = null

    try {
      const lockAcquired = await this.acquireLock(filePath, lockOwner)
      if (!lockAcquired) {
        return { success: false, error: `Could not acquire lock for ${filePath}` }
      }

      if (existsSync(filePath)) {
        backupPath = await this.createBackup(filePath)
      }

      const dir = dirname(filePath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      const encoding = mergedOptions.encoding || 'utf8'
      await writeFile(filePath, content, { encoding })

      logger.info(`Successfully wrote file: ${filePath}`)
      return { success: true, backupPath: backupPath || undefined }
    } catch (error: any) {
      logger.error(`Failed to write file ${filePath}: ${error}`)
      
      if (backupPath && existsSync(backupPath)) {
        try {
          await copyFile(backupPath, filePath)
          logger.info(`Restored from backup: ${filePath}`)
        } catch (restoreError) {
          logger.error(`Failed to restore backup for ${filePath}: ${restoreError}`)
        }
      }

      return { success: false, error: error.message || 'Unknown error' }
    } finally {
      await this.releaseLock(filePath)
    }
  }

  async safeReadFile(filePath: string, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; content?: string; error?: string; stats?: FileInfo }> {
    const mergedOptions = { ...this.options, ...options }
    const validation = this.validatePath(filePath)
    
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      const encoding = mergedOptions.encoding || 'utf8'
      const content = await readFile(filePath, { encoding })
      const stats = await this.getFileInfo(filePath)
      
      logger.debug(`Successfully read file: ${filePath}`)
      return { success: true, content, stats }
    } catch (error: any) {
      logger.error(`Failed to read file ${filePath}: ${error}`)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  async safeDeleteFile(filePath: string, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    const mergedOptions = { ...this.options, ...options }
    const validation = this.validatePath(filePath)
    
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const lockOwner = `delete-${Date.now()}`
    let backupPath: string | null = null

    try {
      const lockAcquired = await this.acquireLock(filePath, lockOwner)
      if (!lockAcquired) {
        return { success: false, error: `Could not acquire lock for ${filePath}` }
      }

      if (existsSync(filePath)) {
        backupPath = await this.createBackup(filePath)
        await unlink(filePath)
        logger.info(`Successfully deleted file: ${filePath}`)
        return { success: true, backupPath: backupPath || undefined }
      } else {
        return { success: false, error: `File not found: ${filePath}` }
      }
    } catch (error: any) {
      logger.error(`Failed to delete file ${filePath}: ${error}`)
      
      if (backupPath && existsSync(backupPath)) {
        try {
          await copyFile(backupPath, filePath)
          logger.info(`Restored from backup: ${filePath}`)
        } catch (restoreError) {
          logger.error(`Failed to restore backup for ${filePath}: ${restoreError}`)
        }
      }

      return { success: false, error: error.message || 'Unknown error' }
    } finally {
      await this.releaseLock(filePath)
    }
  }

  async safeRenameFile(oldPath: string, newPath: string, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    const mergedOptions = { ...this.options, ...options }
    const oldValidation = this.validatePath(oldPath)
    const newValidation = this.validatePath(newPath)
    
    if (!oldValidation.valid) {
      return { success: false, error: oldValidation.error }
    }
    if (!newValidation.valid) {
      return { success: false, error: newValidation.error }
    }

    const lockOwner = `rename-${Date.now()}`
    let backupPath: string | null = null

    try {
      const lockAcquired = await this.acquireLock(oldPath, lockOwner)
      if (!lockAcquired) {
        return { success: false, error: `Could not acquire lock for ${oldPath}` }
      }

      if (existsSync(oldPath)) {
        backupPath = await this.createBackup(oldPath)
        
        const newDir = dirname(newPath)
        if (!existsSync(newDir)) {
          await mkdir(newDir, { recursive: true })
        }
        
        await rename(oldPath, newPath)
        logger.info(`Successfully renamed file: ${oldPath} -> ${newPath}`)
        return { success: true, backupPath: backupPath || undefined }
      } else {
        return { success: false, error: `File not found: ${oldPath}` }
      }
    } catch (error: any) {
      logger.error(`Failed to rename file ${oldPath}: ${error}`)
      return { success: false, error: error.message || 'Unknown error' }
    } finally {
      await this.releaseLock(oldPath)
    }
  }

  async safeCopyFile(sourcePath: string, destinationPath: string, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; error?: string }> {
    const mergedOptions = { ...this.options, ...options }
    const sourceValidation = this.validatePath(sourcePath)
    const destValidation = this.validatePath(destinationPath)
    
    if (!sourceValidation.valid) {
      return { success: false, error: sourceValidation.error }
    }
    if (!destValidation.valid) {
      return { success: false, error: destValidation.error }
    }

    try {
      if (existsSync(sourcePath)) {
        const destDir = dirname(destinationPath)
        if (!existsSync(destDir)) {
          await mkdir(destDir, { recursive: true })
        }
        
        await copyFile(sourcePath, destinationPath)
        logger.info(`Successfully copied file: ${sourcePath} -> ${destinationPath}`)
        return { success: true }
      } else {
        return { success: false, error: `Source file not found: ${sourcePath}` }
      }
    } catch (error: any) {
      logger.error(`Failed to copy file ${sourcePath}: ${error}`)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  async listDirectory(dirPath: string, options?: Partial<FileOperationOptions>): Promise<{ success: boolean; files?: FileInfo[]; error?: string }> {
    const mergedOptions = { ...this.options, ...options }
    const validation = this.validatePath(dirPath)
    
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const files: FileInfo[] = []

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        const stats = await stat(fullPath)
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          mtime: stats.mtime,
          extname: extname(entry.name)
        })
      }

      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      logger.debug(`Successfully listed directory: ${dirPath} (${files.length} entries)`)
      return { success: true, files }
    } catch (error: any) {
      logger.error(`Failed to list directory ${dirPath}: ${error}`)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    const stats = await stat(filePath)
    return {
      path: filePath,
      name: basename(filePath),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      mtime: stats.mtime,
      extname: extname(filePath)
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK)
      return true
    } catch {
      return false
    }
  }
}

const defaultFileOperationsManager = new FileOperationsManager()
export { defaultFileOperationsManager as fileOperationsManager }
