/** Debounce utility function to limit function execution frequency */
function debounce<F extends (...args: any) => any>(func: F, waitFor: number) {
	let timeout: number;

	return (...args: Parameters<F>): Promise<ReturnType<F>> => {
		clearTimeout(timeout);

		return new Promise((resolve) => {
			timeout = setTimeout(() => {
				resolve(func(...args));
			}, waitFor);
		});
	};
}

/** Constants for grid calculation
* GRID_RATIO represents the ratio of the grid's height to the window's height.
*/
const GRID_RATIO = 9 / 20;
const ROW_HEIGHT = 16;

/** manage data and settings on the grid */
class ApiData {

	pageSize: number;
	currentPage: number = 1;
	data: GridData[] = [];
	totalItems: number = 0;
	columnNames: ColumnName[] = [];
	maxGridHeight: number = 0;
	firstVal: number = 0;
	lastVal: number = -1;
	maxRange: number;

	constructor(pageSize: number) {
		this.pageSize = pageSize;
		this.maxRange = 0;
	}

	/** Initialize method to set up the grid */
	initialize(): Promise<void> {
		this.adjustGridHeight();
		return this.recordCount()
			.then(() => this.fetchColumns())
			.then(() => this.fetchAndDisplayRecords())
			.then(() => this.setupControls());
	}

	/** Fetch total record count from the server,fetches data from an API and populates class properties */
	recordCount(): Promise<void> {
		return this.fetchNumData('http://localhost:2050/recordCount')
			.then((response: number) => {
				this.totalItems = response;
				this.maxRange = this.totalItems - 1;
			})
			.catch(error => {
				console.error('Failed to fetch record count:', error);
				throw error;
			});
	}

	/** Use the fetchData() func to make an HTTP request to the API endpoint and process the data */
	fetchColumns(): Promise<void> {
		return this.fetchStrData('http://localhost:2050/columns')
			.then((response: string) => {
				const res = JSON.parse(response);
				this.columnNames = res.map((columnName: string) => ({ name: columnName }));
				// Initialize the 'data' property as an empty array of GridData objects
				this.data = new Array<GridData>(this.columnNames.length);
			})
			.catch(error => {
				console.error('Failed to fetch columns:' + error);
				throw ('Failed to fetch columns:' + error);
			});
	}

	/** Get records from API for fetch and search functionality */
	fetchAndProcessRecords(from: number, to: number): Promise<GridData[]> {
		$('#spinner').show();
		$('#grid').hide();

		return this.fetchStrData(`http://localhost:2050/records?from=${from}&to=${to}`)
			.then((response: string) => {
				const res = JSON.parse(response);
				const processedData = res.map((record: string[]) => {
					const obj: GridData = {};
					for (let j = 0; j < this.columnNames.length && j < record.length; j++) {
						obj[this.columnNames[j].name] = record[j];
					}
					return obj;
				});
				$('#spinner').hide();
				$('#grid').show();
				return processedData;
			})
			.catch(error => {
				console.error('Failed to fetch records: ', error);
				throw new Error('Failed to fetch records: ' + error);
			});
	}

	/** Fetches records using fetchAndProcessRecords(), processes them, displays them, and updates page information. */
	fetchAndDisplayRecords(): Promise<void> {
		let from = this.firstVal;
		let to = Math.min(from + this.pageSize - 1, this.maxRange);

		if (to >= this.maxRange) {
			const lastPage = Math.ceil(this.firstVal / this.pageSize) + 1;
			this.currentPage = lastPage;
			from = this.maxRange - this.pageSize + 1;
			to = this.maxRange;
		}

		return this.fetchAndProcessRecords(from, to)
			.then(processedData => {
				this.data = processedData;
				this.displayRecords();
			})
			.catch(error => {
				console.error('Failed to fetch records:', error);
				alert('Error occured while fetching records!');
			});
	}

	/** search through records using fromID */
	searchRecords(searchValue: number): Promise<void> {
		if (searchValue >= 0 && searchValue <= this.maxRange) {
			this.firstVal = searchValue;
			if (searchValue + this.pageSize > this.maxRange) {
				this.firstVal = Math.max(0, this.maxRange - this.pageSize + 1);
			}
			this.currentPage = Math.ceil(this.firstVal / this.pageSize) + 1;
			// empty search input after searching 
			$('#fromInput').val('');
			return this.fetchAndDisplayRecords();
		} else {
			alert(`Error while searching, please enter values in the range (0-${this.maxRange})`);
			return Promise.resolve();
		}
	}

	/** use Ajax for data fetching */
	private async fetchStrData(url: string): Promise<string> {
		$('#overlay').show();
		const response = await $.ajax({
			url,
			method: 'GET',
		});
		$('#overlay').hide();
		return response;
	}

	private async fetchNumData(url: string): Promise<number> {
		const response = await $.ajax({
			url,
			method: 'GET',
		});
		return response;
	}

	/** Change grid height according to screen size */
	private adjustGridHeight(): void {
		const gridElement = document.getElementById('grid');
		const pageCntrl = $('.grid-controls').innerHeight();
		const screenHeight = $(window).innerHeight();
		if (gridElement && pageCntrl !== undefined && screenHeight !== undefined) {
			this.maxGridHeight = screenHeight - pageCntrl;
			gridElement.style.height = `${this.maxGridHeight}px`;
		}
	}

	/** Update the page information and records display based on the current state of the grid. */
	private updatePageInfo(): void {
		const totalPages = Math.ceil(this.totalItems / this.pageSize);
		const pageInfo = `Page ${this.currentPage} of ${totalPages}`;
		const from = this.firstVal;
		let to = Math.min(from + this.pageSize - 1, this.maxRange);
		$('#pageInfo').text(`${pageInfo}`);
		$('.records').text(`Showing records ${from} to ${to}`);
	}

	private setupControls(): void {
		$('#prevBtn').on('click', () => this.handlePageChange(-1));
		$('#nextBtn').on('click', () => this.handlePageChange(1));
		$(window).on('resize', debounce(() => { this.handleResize(); }, 100));
	}

	/** Handles page navigation by updating the firstVal, lastVal, current page, and enabling/disabling previous and next buttons as needed. */
	private handlePageChange(delta: number): void {
		let prevBtn = $('#prevBtn');
		let nextBtn = $('#nextBtn');

		// Check if delta(change in page number) is positive and disable the next page if firstval + pageSize exceeds the MaxRange.
		if (delta > 0 && this.firstVal + delta * this.pageSize > this.maxRange) {
			this.firstVal = this.maxRange - this.pageSize + 1;
			prevBtn.attr("disabled", null);
			nextBtn.attr("disabled", "disabled");
		} else if (delta < 0 && this.firstVal + delta * this.pageSize < 0) {
			// If delta is negative then reset firstVal to 0 and disable prev button 
			this.firstVal = 0;
			prevBtn.attr("disabled", "disabled");
			nextBtn.attr("disabled", null);
		} else {
			this.firstVal = Math.max(0, Math.min(this.firstVal + delta * this.pageSize, this.maxRange));
			prevBtn.attr("disabled", null);
			nextBtn.attr("disabled", null);
		}

		this.currentPage = Math.ceil(this.firstVal / this.pageSize) + 1;

		this.fetchAndDisplayRecords()
			.catch(error => {
				console.error("Error fetching records while changing page :", error);
				alert('Error occured while changing page!');
			});
	}

	private handleResize(): void {
		const newGridSize = Math.ceil((Math.ceil(<number>($(window).innerHeight())) * GRID_RATIO) / ROW_HEIGHT) - 1;

		// Check if the new grid size is non-negative
		if (newGridSize >= 0) {
			// Adjust firstVal for the last page
			if (this.firstVal + newGridSize > this.maxRange) {
				this.firstVal = this.maxRange - newGridSize + 1;
			}

			this.pageSize = newGridSize;
			this.lastVal = this.firstVal + newGridSize - 1;

			this.adjustGridHeight();

			this.fetchAndDisplayRecords()
				.then(() => {
					this.updatePageInfo();
				})
				.catch(error => {
					console.error("Error fetching records while resizing:", error);
					alert('Error occured while resizing!');
				});
		}
	}

	private displayRecords(): void {
		const gridTemplate = new GridTemplate(this.columnNames, this.data);
		gridTemplate.displayRecords();
		this.updatePageInfo();
	}
}
