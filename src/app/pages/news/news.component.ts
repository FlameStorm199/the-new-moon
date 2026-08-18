import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface MediaItem {
  type: 'image' | 'video';
  filename: string;
}

interface DocumentItem {
  title: string;
  filename: string;
}

interface NewsItem {
  id: number;
  title: string;
  date: string;
  summary: string;
  content: string;
  location?: string;
  documents?: DocumentItem[];
  media?: MediaItem[];
}

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news.component.html',
  styleUrl: './news.component.scss'
})
export class NewsComponent implements OnInit {
  newsList: NewsItem[] = [];
  selectedNews: NewsItem | null = null;
  lightboxMedia: MediaItem | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<NewsItem[]>('assets/data/news.json').subscribe(data => {
      this.newsList = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }

  open(news: NewsItem) {
    this.selectedNews = news;
    window.scrollTo(0, 0);
  }

  close() {
    this.selectedNews = null;
    this.lightboxMedia = null;
  }

  openLightbox(media: MediaItem) {
    this.lightboxMedia = media;
  }

  closeLightbox() {
    this.lightboxMedia = null;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  getMediaPath(filename: string): string {
    return `assets/news/${filename}`;
  }

  downloadFile(filename: string) {
    const link = document.createElement('a');
    link.href = `assets/news/${filename}`;
    link.download = filename;
    link.target = '_blank';
    link.click();
  }
}