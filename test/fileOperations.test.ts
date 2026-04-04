import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile, unlink, rm, readFile } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileOperationsManager } from '../src/utils/fileOperations.js'
import { SecurityManager } from '../src/utils/security.js'

const TEST_DIR = join(process.cwd(), '.test-temp')

describe('File Operations Manager', () => {
  beforeEach(async () => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('Basic File Operations', () => {
    it('should write and read a file successfully', async () => {
      const testPath = join(TEST_DIR, 'test.txt')
      const testContent = 'Hello, World!'

      const writeResult = await fileOperationsManager.safeWriteFile(testPath, testContent)
      assert.strictEqual(writeResult.success, true, 'Write should succeed')

      const readResult = await fileOperationsManager.safeReadFile(testPath)
      assert.strictEqual(readResult.success, true, 'Read should succeed')
      assert.strictEqual(readResult.content, testContent, 'Content should match')
    })

    it('should delete a file successfully', async () => {
      const testPath = join(TEST_DIR, 'to-delete.txt')
      await writeFile(testPath, 'content')

      const deleteResult = await fileOperationsManager.safeDeleteFile(testPath)
      assert.strictEqual(deleteResult.success, true, 'Delete should succeed')
      assert.strictEqual(existsSync(testPath), false, 'File should not exist after delete')
    })

    it('should rename a file successfully', async () => {
      const oldPath = join(TEST_DIR, 'old-name.txt')
      const newPath = join(TEST_DIR, 'new-name.txt')
      await writeFile(oldPath, 'content')

      const renameResult = await fileOperationsManager.safeRenameFile(oldPath, newPath)
      assert.strictEqual(renameResult.success, true, 'Rename should succeed')
      assert.strictEqual(existsSync(oldPath), false, 'Old file should not exist')
      assert.strictEqual(existsSync(newPath), true, 'New file should exist')
    })

    it('should copy a file successfully', async () => {
      const sourcePath = join(TEST_DIR, 'source.txt')
      const destPath = join(TEST_DIR, 'dest.txt')
      const testContent = 'copy test'
      await writeFile(sourcePath, testContent)

      const copyResult = await fileOperationsManager.safeCopyFile(sourcePath, destPath)
      assert.strictEqual(copyResult.success, true, 'Copy should succeed')
      
      const destContent = await readFile(destPath, 'utf8')
      assert.strictEqual(destContent, testContent, 'Content should match')
    })

    it('should list directory contents', async () => {
      const dirPath = TEST_DIR
      await writeFile(join(dirPath, 'file1.txt'), 'content1')
      await mkdir(join(dirPath, 'subdir'))
      await writeFile(join(dirPath, 'subdir', 'file2.txt'), 'content2')

      const listResult = await fileOperationsManager.listDirectory(dirPath)
      assert.strictEqual(listResult.success, true, 'List should succeed')
      assert.ok(listResult.files, 'Files should be returned')
      assert.ok(listResult.files!.length >= 2, 'Should have at least 2 entries')
    })
  })

  describe('Backup System', () => {
    it('should create a backup when writing to an existing file', async () => {
      const testPath = join(TEST_DIR, 'backup-test.txt')
      const originalContent = 'original'
      await writeFile(testPath, originalContent)

      const writeResult = await fileOperationsManager.safeWriteFile(testPath, 'new content')
      assert.strictEqual(writeResult.success, true, 'Write should succeed')
      assert.ok(writeResult.backupPath, 'Backup path should be provided')
      assert.ok(existsSync(writeResult.backupPath!), 'Backup file should exist')
    })
  })

  describe('Security', () => {
    it('should reject paths outside allowed directory', async () => {
      const restrictedManager = new (fileOperationsManager.constructor as any)({
        securityManager: new SecurityManager({ allowedPaths: [TEST_DIR] }),
        createBackup: false,
        enableLocking: false
      })

      const outsidePath = join(process.cwd(), 'outside.txt')
      const result = await restrictedManager.safeWriteFile(outsidePath, 'content')
      assert.strictEqual(result.success, false, 'Write should fail for outside path')
    })
  })

  describe('File Info', () => {
    it('should get correct file info', async () => {
      const testPath = join(TEST_DIR, 'info-test.txt')
      const testContent = 'test content'
      await writeFile(testPath, testContent)

      const info = await fileOperationsManager.getFileInfo(testPath)
      assert.strictEqual(info.name, 'info-test.txt', 'Name should match')
      assert.strictEqual(info.isFile, true, 'Should be a file')
      assert.strictEqual(info.size, Buffer.byteLength(testContent), 'Size should match')
    })
  })
})
