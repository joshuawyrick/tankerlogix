import FileUploader from "@/components/upload/file-uploader";

export default function Upload() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">File Upload</h1>
        <p className="text-muted-foreground mt-1">
          Upload CSV or XLSX files for locations, route overrides, and configuration settings.
        </p>
      </div>
      
      <FileUploader />
    </div>
  );
}
