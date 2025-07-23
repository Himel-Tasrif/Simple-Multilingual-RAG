// Enhanced Admin panel JS for upload progress & feedback

document.addEventListener("DOMContentLoaded", function () {
    // Show selected file names when files are chosen
    document.getElementById("pdf-upload").addEventListener("change", function () {
        showSelectedFiles(this.files);
    });

    document.getElementById("uploadBtn").addEventListener("click", function () {
        uploadPDF();
    });

    document.getElementById("generateDB").addEventListener("click", function () {
        generateVectorDB();
    });

    loadUploadedPDFs();
});

// Show selected PDF file names before upload
function showSelectedFiles(files) {
    let list = document.getElementById("selectedFilesList");
    list.innerHTML = "";
    if(files.length === 0) {
        list.innerHTML = "<li>No file selected</li>";
        return;
    }
    for(let i=0; i<files.length; i++) {
        let li = document.createElement("li");
        li.textContent = files[i].name;
        list.appendChild(li);
    }
}

// Upload PDFs with loading/progress
function uploadPDF() {
    let fileInput = document.getElementById("pdf-upload");
    let formData = new FormData();
    let progressDiv = document.getElementById("uploadProgress");
    let progressText = document.getElementById("progressText");
    let progressBar = document.getElementById("progressBar");

    if (fileInput.files.length === 0) {
        alert("Please select a file to upload.");
        return;
    }

    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append("pdf_files", fileInput.files[i]);
    }

    // Show loading spinner
    progressDiv.style.display = "block";
    progressText.textContent = "Uploading...";
    progressBar.innerHTML = `<i class="fa fa-spinner fa-spin"></i>`;

    // Use XMLHttpRequest to show upload progress
    let xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/upload_pdf/", true);

    xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
            let percent = Math.round((e.loaded / e.total) * 100);
            progressText.textContent = `Uploading... (${percent}%)`;
        }
    };

    xhr.onload = function () {
        progressDiv.style.display = "none";
        if (xhr.status === 200) {
            alert(JSON.parse(xhr.responseText).message);
            fileInput.value = "";
            showSelectedFiles([]);
            loadUploadedPDFs();
        } else {
            alert("Failed to upload PDF.");
        }
    };

    xhr.onerror = function () {
        progressDiv.style.display = "none";
        alert("Upload failed due to network error.");
    };

    xhr.send(formData);
}

// Generate vector DB with spinner and show PDFs used
function generateVectorDB() {
    let vectorDiv = document.getElementById("vectorProgress");
    let vectorText = document.getElementById("vectorProgressText");
    let vectorBar = document.getElementById("vectorProgressBar");
    let pdfsUsedDiv = document.getElementById("pdfsUsedInfo");

    vectorDiv.style.display = "block";
    vectorText.textContent = "Generating vector DB...";
    vectorBar.innerHTML = `<i class="fa fa-spinner fa-spin"></i>`;
    pdfsUsedDiv.innerHTML = "";

    fetch("/admin/generate_vector_db/", {
        method: "POST"
    })
    .then(response => response.json())
    .then(data => {
        vectorDiv.style.display = "none";
        alert(data.message);
        if (data.pdfs_used && data.pdfs_used.length) {
            pdfsUsedDiv.innerHTML = "PDFs used for vector DB:<br>" + data.pdfs_used.map(f => `<span style="display:inline-block;background:#4c0c9b;padding:3px 8px;margin:2px 5px;border-radius:6px;">${f}</span>`).join("");
        }
        loadUploadedPDFs();
    })
    .catch(error => {
        vectorDiv.style.display = "none";
        alert("Failed to generate vector database.");
    });
}

// Load uploaded PDFs into table
function loadUploadedPDFs() {
    fetch("/admin/list_pdfs/")
    .then(response => response.json())
    .then(data => {
        updatePDFTable(data.pdfs);
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Failed to load uploaded PDFs.");
    });
}

function updatePDFTable(pdfs) {
    let tableBody = document.getElementById("pdfTableBody");
    tableBody.innerHTML = "";

    if (!pdfs || pdfs.length === 0) {
        let row = document.createElement("tr");
        let nameCell = document.createElement("td");
        nameCell.textContent = "No PDFs uploaded";
        nameCell.colSpan = 2;
        row.appendChild(nameCell);
        tableBody.appendChild(row);
        return;
    }

    for (let i = 0; i < pdfs.length; i++) {
        let row = document.createElement("tr");

        // PDF name
        let nameCell = document.createElement("td");
        nameCell.textContent = pdfs[i];

        // Download link
        let downloadCell = document.createElement("td");
        let downloadLink = document.createElement("a");
        downloadLink.href = `/admin/download_pdf/?filename=${encodeURIComponent(pdfs[i])}`;
        downloadLink.textContent = "Download";
        downloadLink.classList.add("download-link");
        downloadCell.appendChild(downloadLink);

        row.appendChild(nameCell);
        row.appendChild(downloadCell);
        tableBody.appendChild(row);
    }
}