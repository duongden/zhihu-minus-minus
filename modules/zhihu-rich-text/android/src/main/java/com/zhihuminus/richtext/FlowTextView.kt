package com.zhihuminus.richtext

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.TextView
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal class FlowTextView(context: Context) : TextView(context) {
  // TextView may call onSelectionChanged during its own constructor.
  private var ready = false
  var selectionListener: ((Int, Int) -> Unit)? = null
  var actionListener: ((JSONObject, String) -> Unit)? = null
  var copyResolver: ((Int, Int) -> String)? = null
  var flow: FlowData? = null
  var config: TextConfig = TextConfig()
  var scale = resources.displayMetrics.density
  private val decorationPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val decorationPath = Path()
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f
  private var moved = false
  private var longPressed = false
  private var hadSelection = false

  init {
    setPadding(0, 0, 0, 0)
    includeFontPadding = false
    setTextIsSelectable(true)
    isClickable = true
    ready = true
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    if (ready) selectionListener?.invoke(selStart, selEnd)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        moved = false
        longPressed = false
        hadSelection = selectionStart >= 0 && selectionEnd > selectionStart
      }
      MotionEvent.ACTION_MOVE -> {
        if (abs(event.x - downX) > touchSlop || abs(event.y - downY) > touchSlop) moved = true
      }
    }
    val handled = super.onTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP && !moved && !longPressed && !hadSelection) {
      if (selectionStart < 0 || selectionStart == selectionEnd) {
        val action = findActionAt(event.x, event.y)
        if (action != null) {
          actionListener?.invoke(action.first, action.second)
          return true
        }
      }
    }
    return handled
  }

  override fun performLongClick(): Boolean {
    longPressed = true
    val handled = super.performLongClick()
    val action = findActionAt(downX, downY)
    if (action?.second == "attachment") actionListener?.invoke(action.first, "attachmentLongPress")
    return handled
  }

  override fun onTextContextMenuItem(id: Int): Boolean {
    if (id == android.R.id.copy && selectionStart >= 0 && selectionStart != selectionEnd) {
      val start = min(selectionStart, selectionEnd)
      val end = max(selectionStart, selectionEnd)
      val copy = copyResolver?.invoke(start, end)
      if (copy != null) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("", copy))
        // Keep the system action mode and selection lifecycle intact.
        clearFocus()
        return true
      }
    }
    return super.onTextContextMenuItem(id)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val activeFlow = flow ?: return
    val textLayout = layout ?: return
    canvas.save()
    canvas.translate(totalPaddingLeft.toFloat() - scrollX, totalPaddingTop.toFloat() - scrollY)
    for (decoration in activeFlow.decorations) {
      val range = decoration.range(activeFlow.text.length) ?: continue
      val firstLine = textLayout.getLineForOffset(range.start)
      val lastLine = textLayout.getLineForOffset((range.end - 1).coerceAtLeast(range.start))
      decorationPaint.color = parseColor(decoration.optString("color"), config.linkColor)
      decorationPaint.strokeWidth = (decoration.optDouble("thickness", 1.2).toFloat() * scale).coerceAtLeast(1f)
      decorationPaint.style = Paint.Style.STROKE
      decorationPaint.strokeCap = Paint.Cap.BUTT
      val kind = decoration.optString("kind", "solid")
      decorationPaint.pathEffect = when (kind) {
        "dashed" -> DashPathEffect(floatArrayOf(4f * scale, 3f * scale), 0f)
        "dotted" -> DashPathEffect(floatArrayOf(scale, 2.5f * scale), 0f)
        else -> null
      }
      if (kind == "dotted") decorationPaint.strokeCap = Paint.Cap.ROUND
      for (line in firstLine..lastLine) {
        val start = max(range.start, textLayout.getLineStart(line))
        var end = min(range.end, textLayout.getLineEnd(line))
        while (end > start && activeFlow.text[end - 1] == '\n') end -= 1
        if (end <= start) continue
        val startX = textLayout.getPrimaryHorizontal(start)
        val endX = visualEndHorizontal(end, line)
        val left = min(startX, endX)
        val right = max(startX, endX)
        val y = textLayout.getLineBaseline(line) + decoration.optDouble("offset", 3.0).toFloat() * scale
        if (kind == "wavy") {
          decorationPath.reset()
          decorationPath.moveTo(left, y)
          var x = left
          val halfWave = max(2f, 2.8f * scale)
          var direction = -1f
          while (x < right) {
            val next = min(right, x + halfWave)
            decorationPath.quadTo((x + next) / 2f, y + direction * 2f * scale, next, y)
            x = next
            direction *= -1f
          }
          canvas.drawPath(decorationPath, decorationPaint)
        } else {
          canvas.drawLine(left, y, right, y, decorationPaint)
        }
      }
    }
    decorationPaint.pathEffect = null
    canvas.restore()
  }

  private fun findActionAt(x: Float, y: Float): Pair<JSONObject, String>? {
    val activeFlow = flow ?: return null
    val textLayout = layout ?: return null
    val localX = x - totalPaddingLeft + scrollX
    val localY = y - totalPaddingTop + scrollY
    if (localY < 0 || localY > textLayout.height) return null
    val line = textLayout.getLineForVertical(localY.toInt())
    if (localX < textLayout.getLineLeft(line) || localX > textLayout.getLineRight(line)) return null
    val offset = textLayout.getOffsetForHorizontal(line, localX)
    // offset is the closest caret; include the preceding attachment glyph.
    for (item in activeFlow.attachments) {
      val range = item.range(activeFlow.text.length) ?: continue
      val left = textLayout.getPrimaryHorizontal(range.start)
      val right = visualEndHorizontal(range.end, line)
      if (textLayout.getLineForOffset(range.start) == line && localX >= min(left, right) && localX <= max(left, right)) {
        return item to "attachment"
      }
    }
    for (item in activeFlow.spans.asReversed()) {
      val range = item.range(activeFlow.text.length) ?: continue
      if (item.optString("kind") == "link" && offset >= range.start && offset < range.end) return item to "link"
    }
    for (item in activeFlow.decorations.asReversed()) {
      val range = item.range(activeFlow.text.length) ?: continue
      if (item.has("actionId") && offset >= range.start && offset < range.end) return item to "segment"
    }
    return null
  }

  private fun visualEndHorizontal(offset: Int, line: Int): Float {
    val textLayout = layout ?: return 0f
    // A soft-wrap end offset also names the next line's first caret.
    if (textLayout.getLineForOffset(offset) > line) {
      return if (textLayout.getParagraphDirection(line) < 0) textLayout.getLineLeft(line) else textLayout.getLineRight(line)
    }
    return textLayout.getPrimaryHorizontal(offset)
  }
}
