import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface DownloadItem {
  id: number;
  title: string;
  description: string;
  category: string;
  filename: string;
}

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './download.component.html',
  styleUrl: './download.component.scss'
})
export class DownloadComponent implements OnInit {
  downloads: DownloadItem[] = [];
  categories: string[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<DownloadItem[]>('assets/data/downloads.json').subscribe(data => {
      this.downloads = data;
      this.categories = [...new Set(data.map(d => d.category))];
    });
  }

  getByCategory(category: string): DownloadItem[] {
    return this.downloads.filter(d => d.category === category);
  }

  downloadFile(filename: string) {
    const link = document.createElement('a');
    link.href = `assets/docs/${filename}`;
    link.download = filename;
    link.target = '_blank';
    link.click();
  }
}