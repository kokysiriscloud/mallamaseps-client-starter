import { Component, inject } from '@angular/core';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
})
export class HomeComponent {
  session = inject(SessionService).session;
}
