/* ==================================================================
	AngularJS Datatype Editor - Rich Text
	A directive to edit a large text blob in place.
	TODO: In the future it will allow rich text formatting

	Usage:
	<div ade-rich='{"class":"input-large","id":"1234"}' ng-model="data">{{data}}</div>

	Config:
	"class" will be added to the input box so you can style it.
	"id" will be used in messages broadcast to the app on state changes.

	Messages:
		name: ADE-start
		data: id from config

		name: ADE-finish
		data: {id from config, old value, new value, exit value}

------------------------------------------------------------------*/

angular.module('ADE').directive('adeRich', ['ADE', '$compile', function(ADE, $compile) {
	return {
		require: '?ngModel', //optional dependency for ngModel
		restrict: 'A', //Attribute declaration eg: <div ade-rich=""></div>

		//The link step (after compile)
		link: function(scope, element, attrs, controller) {
			var options = {};
			var editing = false;
			var txtArea = null;
			var input = null;
			var value = '';
			var oldValue = '';
			var exit = 0; //0=click, 1=tab, -1= shift tab, 2=return, -2=shift return, 3=esc. controls if you exited the field so you can focus the next field if appropriate
			var timeout = null; //the delay when mousing out of the ppopup

			//whenever the model changes, we get called so we can update our value
			if (controller !== null && controller !== undefined) {
				controller.$render = function() {
					oldValue = value = controller.$modelValue;
					if (value === undefined || value === null) value = '';
					return controller.$viewValue;
				};
			}

			//called once the edit is done, so we can save the new data	and remove edit mode
			var saveEdit = function(exited) {
				oldValue = value;
				exit = exited;

				if (exited != 3) { //don't save value on esc
					value = $('#tinyText_ifr').contents().find('#tinymce')[0].innerHTML;
					// check if contents are empty
					if (value === '<p><br data-mce-bogus="1"></p>') {
						value = '';
					}
					controller.$setViewValue(value);
				}

				input.remove();
				editing = false;

				ADE.done(options, oldValue, value, exit);

				if (exit == 1) {
					element.data('dontclick', true); //tells the focus handler not to click
					element.focus();
					//TODO: would prefer to advance the focus to the next logical element on the page
				} else if (exit == -1) {
					element.data('dontclick', true); //tells the focus handler not to click
					element.focus();
					//TODO: would prefer to advance the focus to the previous logical element on the page
				}

				// we're done, no need to listen to events
				$(document).off('click.ADE');

				scope.$digest();
			};

			//shows a popup with the full text in read mode
			//TODO: handle scrolling of very long text blobs
			var viewRichText = function() {
				scope.ADE_hidePopup();

				var elOffset = element.offset();
				var posLeft = elOffset.left;
				var posTop = elOffset.top + element[0].offsetHeight;
				var content = value.replace ? value.replace(/\n/g, '<br />') : value; //what is inside the popup

				if (!content) return; //dont show popup if there is nothing to show

				$compile('<div class="' + ADE.popupClass + ' ade-rich dropdown-menu open" style="left:' + posLeft + 'px;top:' + posTop + 'px"><div class="ade-richview">' + content + '</div></div>')(scope).insertAfter(element);

				editing = false;

				input = element.next('.ade-rich');
				input.bind('mouseenter.ADE', mousein);
				input.bind('mouseleave.ADE', mouseout);
				input.bind('click.ADE', mouseclick);
			};

			//sets the height of the textarea based on the actual height of the contents.
			//min and max are set in css
			var textareaHeight = function(elem) {
				elem.style.height = '1px';
				elem.style.height = (elem.scrollHeight) + 'px';
			};

			// don't blur on initialization
			var ready = false;

			// detect clicks outside tinymce textarea
			var outerBlur = function(e) {
				// check where click occurred
				//   1: inside ade popup
				//   0: outside ade popup
				var outerClick = $('.ade-popup').has(e.target).length === 0;

				// check if modal for link is shown
				var modalShown = $('.mce-floatpanel').css('display') === 'block';
				
				if (ready && !modalShown && outerClick) {
					// some elements are outside popup but belong to mce
					// these elements start with the text 'mce_' or have a parent/grandparent that starts with the text 'mce_'
					// the latter include texcolor color pickup background element, link ok and cancel buttons
					
					// check if id starts with 'mce_'
					//   0: true
					//  -1: false
					var parent = e.target;
					var startsMce = false;
					while (parent) {
						if (parent.id.search('mce_') === 0) {
							startsMce = true;
							break;
						}
						parent = parent.parentElement;
					}

					// blur and save changes
					if (!startsMce) {
						mouseout();
						saveEdit(0);
						// reset ready
						ready = false;
					}
				} else {
					// set a timeout so it doesn't trigger during initialization
					setTimeout(function() { ready = true}, 500);
				}
			};

			// handle special keyboard events
			var handleKeyEvents = function(e) {
				switch(e.keyCode) {
					case 27: // esc
						mouseout();
						saveEdit(3); // don't save results
						e.preventDefault();
						break;
					case 9: // tab
						mouseout();
						saveEdit(0); // blur and save
						e.preventDefault();
						break;
					default:
						break;
				}
			};

			//enters edit mode for the text
			var editRichText = function() {
				window.clearTimeout(timeout);
				if(input) input.unbind('.ADE');

				scope.ADE_hidePopup();

				var content = '<textarea id="tinyText" class="' + options.className + '" style="height:30px">' + value + '</textarea>';
				
				var elOffset = element.offset();
				var posLeft = elOffset.left;
				var posTop = elOffset.top + element[0].offsetHeight;
				var html = '<div class="' + ADE.popupClass + ' ade-rich dropdown-menu open" style="left:' + posLeft + 'px;top:' + posTop + 'px">' + content + '</div>';
				$compile(html)(scope).insertAfter(element);

				// Initialize tinymce
				// Full example:
				//   http://www.tinymce.com/tryit/full.php

				tinymce.init({
					selector: "#tinyText",
					theme: "modern",
					menubar: "false",
					plugins: ["textcolor", "link"],
					toolbar: "styleselect | bold italic | bullist numlist outdent indent | hr | link | forecolor backcolor",
					// CHANGE: Added to TinyMCE plugin
					handleKeyEvents: handleKeyEvents
				});

				editing = true;

				input = element.next('.ade-rich');

				// Handle blur case
				// save when user blurs out of text editor
				// listen to clicks on all elements in page
				// this will determine when to blur
				$(document).bind('click.ADE', outerBlur);
			};

			//When the mouse enters, show the popup view of the note
			var mousein = function()  {
				window.clearTimeout(timeout);
				
				//if any other popup is open in edit mode, don't do this view
				if (angular.element('.ade-rich').hasClass('open') && angular.element('.ade-rich').find('textarea').length) return;

				var linkPopup = element.next('.ade-rich');
				if (!linkPopup.length) {
					viewRichText();
				}
			};

			//if the mouse leaves, hide the popup note view if in read mode
			var mouseout = function() {
				var linkPopup = element.next('.' + ADE.popupClass + '');
				if (linkPopup.length && !editing) { //checks for read/edit mode
					timeout = window.setTimeout(function() {
						scope.ADE_hidePopup(element);
					},400);
				}
			};

			//handles clicks on the read version of the data
			var mouseclick = function() {
				if(element) element.unbind('keypress.ADE');
				window.clearTimeout(timeout);
				if (editing) return;
				editing = true;
				exit = 0;

				ADE.begin(options);

				editRichText();
			};

			element.bind('mouseenter.ADE', mousein);
			element.bind('mouseleave.ADE', mouseout);
			element.bind('click.ADE', mouseclick);

			//handles focus events
			element.bind('focus.ADE', function(e) {

				//if this is an organic focus, then do a click to make the popup appear.
				//if this was a focus caused my myself then don't do the click
				if (!element.data('dontclick')) {
					element.click();
					return;
				}
				window.setTimeout(function() { //IE needs this delay because it fires 2 focus events in quick succession.
					element.data('dontclick',false);
				},100);

				//listen for keys pressed while the element is focused but not clicked
				element.bind('keypress.ADE', function(e) {
					if (e.keyCode == 13) { //return
						e.preventDefault();
						e.stopPropagation(); //to prevent return key from going into text box
						element.click();
					} else if (e.keyCode != 9) { //not tab
						//for a key other than tab we want it to go into the text box
						element.click();
					}
				});

			});

			//handles blur events
			element.bind('blur.ADE', function(e) {
				if(element) element.unbind('keypress.ADE');
			});

			// Watches for changes to the element
			// TODO: understand why I have to return the observer and why the observer returns element
			return attrs.$observe('adeRich', function(settings) { //settings is the contents of the ade-rich="" string
				options = ADE.parseSettings(settings, {className: 'input-xlarge'});
				return element;
			});
		}
	};
}]);
