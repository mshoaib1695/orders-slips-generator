let filePath = null;
let previewData = [];

window.addEventListener("DOMContentLoaded", () => {
  const selectBtn = document.getElementById("selectBtn");
  const generateBtn = document.getElementById("generateBtn");
  const selectedFile = document.getElementById("selectedFile");
  const tableWrapper = document.getElementById("tableWrapper");
  const previewContainer = document.getElementById("previewContainer");
  const status = document.getElementById("status");

  selectBtn.addEventListener(
    "click",
    async () => {
      const selected = await window.electronAPI.selectFile();
      console.log("Selected file:", selected);

      if (!selected) {
        status.innerText = "❌ No file selected.";
        return;
      }

      filePath = selected; // ✅ update global filePath
      selectedFile.innerText = `📄 Selected: ${filePath}`;
      status.innerText = "⏳ Loading preview...";

      try {
        previewData = await window.electronAPI.previewExcel(filePath);

        renderTable(previewData);
        previewContainer.classList.remove("hidden");
        status.innerText = "✅ File loaded. Click 'Generate PDFs' to continue.";
      } catch (err) {
        console.error(err);
        status.innerText = "❌ Failed to preview Excel.";
      }
    },
    { once: true }
  );

  generateBtn.addEventListener("click", async () => {
    console.log("➡ filePath during generate:", filePath); // ✅ debug
    if (!filePath) {
      alert("No file selected.");
      return;
    }
    generateBtn.disabled = true;
    generateBtn.innerText = "⏳ Generating...";

    try {
      const result = await window.electronAPI.processExcel(filePath);
      status.innerText = `✅ PDFs saved to:\n${result}`;

      // ✅ Reset
      filePath = null;
      previewData = [];
      previewContainer.classList.add("hidden");
      selectedFile.innerText = "";
      tableWrapper.innerHTML = "";
    } catch (err) {
      console.error();
      status.innerText = `❌ Error generating PDFs.\n${err.message || err}`;
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerText = "Generate PDFs";
    }
  });

  function renderTable(data) {
    const headers = Object.keys(data[0] || {});
    const tableHTML = `
    <div class="table-container">
      <table class="preview-table">
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
              <tr>
                ${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

    tableWrapper.innerHTML = tableHTML;
  }
});
