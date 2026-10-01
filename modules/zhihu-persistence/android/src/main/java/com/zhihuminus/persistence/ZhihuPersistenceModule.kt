package com.zhihuminus.persistence

import android.net.Uri
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest

class ZhihuPersistenceModule : Module() {
  private fun privateFile(uri: String, roots: List<File>): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file")
    val file = File(parsed.path ?: throw IllegalArgumentException()).canonicalFile
    require(roots.any { file.path.startsWith(it.canonicalPath + File.separator) })
    return file
  }

  override fun definition() = ModuleDefinition {
    Name("ZhihuPersistence")
    AsyncFunction("writeAtomically") { uri: String, value: String ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException()
        val bytes = value.toByteArray(Charsets.UTF_8)
        require(bytes.size <= 16_777_216)
        val atomic = AtomicFile(privateFile(uri, listOf(context.filesDir)))
        val stream = atomic.startWrite()
        try {
          stream.write(bytes)
          atomic.finishWrite(stream)
        } catch (error: Exception) {
          atomic.failWrite(stream)
          throw error
        }
      } catch (_: Exception) {
        throw IllegalStateException("Storage write failed")
      }
    }
    AsyncFunction("readAtomically") { uri: String ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException()
        val file = privateFile(uri, listOf(context.filesDir))
        val atomic = AtomicFile(file)
        try {
          // openRead restores .bak on older Android and removes unfinished .new.
          atomic.openRead().use { stream ->
            require(file.length() <= 16_777_216L)
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(65_536)
            while (true) {
              val count = stream.read(buffer)
              if (count < 0) break
              require(output.size() + count <= 16_777_216)
              output.write(buffer, 0, count)
            }
            val bytes = output.toByteArray()
            Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString()
          }
        } catch (error: FileNotFoundException) {
          if (!file.exists() && !File(file.path + ".bak").exists()) null else throw error
        }
      } catch (_: Exception) {
        throw IllegalStateException("Storage read failed")
      }
    }
    AsyncFunction("inspectApk") { uri: String ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException()
        val file = privateFile(uri, listOf(context.filesDir, context.cacheDir))
        require(file.isFile && file.length() <= 1_073_741_824L)
        val expected = file.length()
        val hash = MessageDigest.getInstance("SHA-256")
        var total = 0L
        var isZip = false
        file.inputStream().buffered().use { stream ->
          val buffer = ByteArray(1_048_576)
          while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            if (total == 0L && count >= 4) isZip = buffer[0] == 0x50.toByte() && buffer[1] == 0x4b.toByte() && buffer[2] == 0x03.toByte() && buffer[3] == 0x04.toByte()
            total += count
            require(total <= 1_073_741_824L)
            hash.update(buffer, 0, count)
          }
        }
        require(total == expected)
        mapOf("size" to total, "sha256" to hash.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }, "isZip" to isZip)
      } catch (_: Exception) {
        throw IllegalStateException("Package inspection failed")
      }
    }
  }
}
